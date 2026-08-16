package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	listenAddr      = ":8080"
	clamdAddr       = "127.0.0.1:3310"
	maxAssetBytes   = int64(128 * 1024 * 1024)
	chunkSize       = 1024 * 1024
	maxAssetsPerRun = 20
	maxRunDuration  = 7 * time.Minute
)

type pendingResponse struct {
	Assets []pendingAsset `json:"assets"`
}

type pendingAsset struct {
	ID            int64  `json:"id"`
	PublicationID int64  `json:"publication_id"`
	FileName      string `json:"file_name"`
	MIMEType      string `json:"mime_type"`
	SizeBytes     int64  `json:"size_bytes"`
	SHA256        string `json:"sha256"`
	ScanAttempts  int    `json:"scan_attempts"`
}

type scanResult struct {
	AssetID           int64  `json:"asset_id"`
	SHA256            string `json:"sha256,omitempty"`
	Verdict           string `json:"verdict"`
	DetectedMIME      string `json:"detected_mime,omitempty"`
	Engine            string `json:"engine"`
	EngineVersion     string `json:"engine_version,omitempty"`
	SignaturesVersion string `json:"signatures_version,omitempty"`
	ThreatName        string `json:"threat_name,omitempty"`
	ScannedAt         string `json:"scanned_at"`
	Error             string `json:"error,omitempty"`
}

type heartbeat struct {
	ScannerID          string `json:"scanner_id"`
	Ready              bool   `json:"ready"`
	Engine             string `json:"engine,omitempty"`
	EngineVersion      string `json:"engine_version,omitempty"`
	SignaturesVersion  string `json:"signatures_version,omitempty"`
	LastScanAt         string `json:"last_scan_at,omitempty"`
	Error              string `json:"error,omitempty"`
}

type clamVersion struct {
	EngineVersion     string
	SignaturesVersion string
	Raw               string
}

type runConfig struct {
	MainOrigin string
	Token      string
	ScannerID  string
}

var httpClient = &http.Client{Timeout: 10 * time.Minute}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("POST /run", runHandler)
	server := &http.Server{
		Addr:              listenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	log.Printf("dollar scanner listening on %s", listenAddr)
	log.Fatal(server.ListenAndServe())
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	version, err := getClamVersion()
	w.Header().Set("content-type", "application/json")
	w.Header().Set("cache-control", "no-store")
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
		"engine": "ClamAV",
		"engine_version": version.EngineVersion,
		"signatures_version": version.SignaturesVersion,
	})
}

func runHandler(w http.ResponseWriter, r *http.Request) {
	cfg, err := configFromRequest(r)
	if err != nil {
		http.Error(w, "invalid scanner configuration", http.StatusBadRequest)
		return
	}

	version, err := getClamVersion()
	if err != nil {
		_ = postHeartbeat(r.Context(), cfg, heartbeat{
			ScannerID: cfg.ScannerID,
			Ready: false,
			Engine: "ClamAV",
			Error: limitText(err.Error(), 900),
		})
		http.Error(w, "clamd is not ready", http.StatusServiceUnavailable)
		return
	}

	_ = postHeartbeat(r.Context(), cfg, heartbeat{
		ScannerID: cfg.ScannerID,
		Ready: true,
		Engine: "ClamAV",
		EngineVersion: version.EngineVersion,
		SignaturesVersion: version.SignaturesVersion,
	})

	deadline := time.Now().Add(maxRunDuration)
	scanned := 0
	failed := 0
	lastScanAt := ""
	var lastErr error

	for scanned+failed < maxAssetsPerRun && time.Now().Before(deadline) {
		asset, ok, err := claimOne(r.Context(), cfg)
		if err != nil {
			lastErr = err
			break
		}
		if !ok {
			break
		}

		result := scanAsset(r.Context(), cfg, asset, version)
		lastScanAt = result.ScannedAt
		if result.Verdict == "failed" {
			failed++
			lastErr = errors.New(result.Error)
		} else {
			scanned++
		}
		if err := postScanResult(r.Context(), cfg, result); err != nil {
			lastErr = err
			break
		}
	}

	hb := heartbeat{
		ScannerID: cfg.ScannerID,
		Ready: true,
		Engine: "ClamAV",
		EngineVersion: version.EngineVersion,
		SignaturesVersion: version.SignaturesVersion,
		LastScanAt: lastScanAt,
	}
	if lastErr != nil {
		hb.Error = limitText(lastErr.Error(), 900)
	}
	_ = postHeartbeat(r.Context(), cfg, hb)

	w.Header().Set("content-type", "application/json")
	w.Header().Set("cache-control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": lastErr == nil,
		"scanned": scanned,
		"failed": failed,
		"error": func() string { if lastErr != nil { return limitText(lastErr.Error(), 900) }; return "" }(),
	})
}

func configFromRequest(r *http.Request) (runConfig, error) {
	auth := strings.TrimSpace(r.Header.Get("authorization"))
	if !strings.HasPrefix(auth, "Bearer ") || len(auth) <= len("Bearer ")+16 {
		return runConfig{}, errors.New("missing scanner token")
	}
	originRaw := strings.TrimSpace(r.Header.Get("x-main-origin"))
	u, err := url.Parse(originRaw)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.Path != "" {
		return runConfig{}, errors.New("invalid main origin")
	}
	scannerID := limitText(strings.TrimSpace(r.Header.Get("x-scanner-id")), 80)
	if scannerID == "" {
		scannerID = "clamav-primary"
	}
	return runConfig{MainOrigin: u.String(), Token: strings.TrimPrefix(auth, "Bearer "), ScannerID: scannerID}, nil
}

func claimOne(ctx context.Context, cfg runConfig) (pendingAsset, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.MainOrigin+"/internal/asset-scan/pending?limit=1", nil)
	if err != nil { return pendingAsset{}, false, err }
	req.Header.Set("authorization", "Bearer "+cfg.Token)
	resp, err := httpClient.Do(req)
	if err != nil { return pendingAsset{}, false, err }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return pendingAsset{}, false, fmt.Errorf("pending queue HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var payload pendingResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&payload); err != nil {
		return pendingAsset{}, false, err
	}
	if len(payload.Assets) == 0 { return pendingAsset{}, false, nil }
	return payload.Assets[0], true, nil
}

func scanAsset(ctx context.Context, cfg runConfig, asset pendingAsset, version clamVersion) scanResult {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	base := scanResult{
		AssetID: asset.ID,
		Verdict: "failed",
		Engine: "ClamAV",
		EngineVersion: version.EngineVersion,
		SignaturesVersion: version.SignaturesVersion,
		ScannedAt: now,
	}
	if asset.ID <= 0 {
		base.Error = "invalid asset id"
		return base
	}
	if asset.SizeBytes > maxAssetBytes {
		base.Error = fmt.Sprintf("asset exceeds scanner limit: %d bytes", asset.SizeBytes)
		return base
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.MainOrigin+"/internal/asset-scan/assets/"+strconv.FormatInt(asset.ID, 10), nil)
	if err != nil { base.Error = err.Error(); return base }
	req.Header.Set("authorization", "Bearer "+cfg.Token)
	resp, err := httpClient.Do(req)
	if err != nil { base.Error = err.Error(); return base }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		base.Error = fmt.Sprintf("asset fetch HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		return base
	}
	if resp.ContentLength > maxAssetBytes {
		base.Error = fmt.Sprintf("asset exceeds scanner limit: %d bytes", resp.ContentLength)
		return base
	}

	expectedHash := strings.ToLower(strings.TrimSpace(resp.Header.Get("x-dollar-sha256")))
	if expectedHash == "" { expectedHash = strings.ToLower(strings.TrimSpace(asset.SHA256)) }
	mediaType, _, _ := mime.ParseMediaType(resp.Header.Get("content-type"))

	verdict, threat, digest, err := streamToClamd(resp.Body)
	if err != nil {
		base.Error = limitText(err.Error(), 1000)
		return base
	}
	if expectedHash != "" && expectedHash != digest {
		base.Error = "sha256 mismatch while streaming asset to ClamAV"
		return base
	}
	base.SHA256 = digest
	base.DetectedMIME = mediaType
	base.Verdict = verdict
	base.ThreatName = threat
	return base
}

func streamToClamd(reader io.Reader) (string, string, string, error) {
	conn, err := net.DialTimeout("tcp", clamdAddr, 10*time.Second)
	if err != nil { return "", "", "", err }
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Minute))
	if _, err := conn.Write([]byte("zINSTREAM\x00")); err != nil { return "", "", "", err }

	hasher := sha256.New()
	buf := make([]byte, chunkSize)
	var total int64
	for {
		n, readErr := reader.Read(buf)
		if n > 0 {
			total += int64(n)
			if total > maxAssetBytes { return "", "", "", fmt.Errorf("stream exceeded %d bytes", maxAssetBytes) }
			var size [4]byte
			binary.BigEndian.PutUint32(size[:], uint32(n))
			if _, err := conn.Write(size[:]); err != nil { return "", "", "", err }
			if _, err := conn.Write(buf[:n]); err != nil { return "", "", "", err }
			_, _ = hasher.Write(buf[:n])
		}
		if readErr == io.EOF { break }
		if readErr != nil { return "", "", "", readErr }
	}
	if _, err := conn.Write([]byte{0, 0, 0, 0}); err != nil { return "", "", "", err }

	reply, err := bufio.NewReader(io.LimitReader(conn, 16*1024)).ReadString(0)
	if err != nil && err != io.EOF { return "", "", "", err }
	reply = strings.TrimSpace(strings.TrimSuffix(reply, "\x00"))
	digest := hex.EncodeToString(hasher.Sum(nil))
	if strings.HasSuffix(reply, ": OK") || reply == "stream: OK" {
		return "clean", "", digest, nil
	}
	if strings.HasSuffix(reply, " FOUND") {
		threat := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(reply, "stream:"), "FOUND"))
		verdict := "infected"
		if strings.HasPrefix(strings.ToLower(threat), "heuristics.") {
			verdict = "suspicious"
		}
		return verdict, threat, digest, nil
	}
	return "", "", digest, fmt.Errorf("clamd response: %s", limitText(reply, 900))
}

func getClamVersion() (clamVersion, error) {
	reply, err := clamdCommand("zVERSION\x00")
	if err != nil { return clamVersion{}, err }
	clean := strings.TrimSpace(strings.TrimSuffix(reply, "\x00"))
	parts := strings.Fields(clean)
	v := clamVersion{Raw: clean}
	if len(parts) >= 2 {
		segments := strings.Split(parts[1], "/")
		if len(segments) > 0 { v.EngineVersion = segments[0] }
		if len(segments) > 1 { v.SignaturesVersion = segments[1] }
	}
	if v.EngineVersion == "" { return clamVersion{}, fmt.Errorf("unexpected ClamAV VERSION response: %s", clean) }
	return v, nil
}

func clamdCommand(command string) (string, error) {
	conn, err := net.DialTimeout("tcp", clamdAddr, 5*time.Second)
	if err != nil { return "", err }
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(15 * time.Second))
	if _, err := conn.Write([]byte(command)); err != nil { return "", err }
	reply, err := bufio.NewReader(io.LimitReader(conn, 16*1024)).ReadString(0)
	if err != nil && err != io.EOF { return "", err }
	return reply, nil
}

func postScanResult(ctx context.Context, cfg runConfig, result scanResult) error {
	return postJSONWithRetry(ctx, cfg.MainOrigin+"/internal/asset-scan/result", cfg.Token, result)
}

func postHeartbeat(ctx context.Context, cfg runConfig, hb heartbeat) error {
	return postJSONWithRetry(ctx, cfg.MainOrigin+"/internal/asset-scan/heartbeat", cfg.Token, hb)
}

func postJSONWithRetry(ctx context.Context, endpoint, token string, value any) error {
	body, err := json.Marshal(value)
	if err != nil { return err }
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(body)))
		if err != nil { return err }
		req.Header.Set("authorization", "Bearer "+token)
		req.Header.Set("content-type", "application/json")
		resp, err := httpClient.Do(req)
		if err == nil {
			responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 { return nil }
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
		} else {
			lastErr = err
		}
		select {
		case <-ctx.Done(): return ctx.Err()
		case <-time.After(time.Duration(attempt+1) * time.Second):
		}
	}
	return lastErr
}

func limitText(value string, max int) string {
	value = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 || r == 127 { return ' ' }
		return r
	}, value))
	if len(value) > max { return value[:max] }
	return value
}
