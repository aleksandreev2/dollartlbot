FROM golang:1.24-alpine AS builder
WORKDIR /src
COPY go.mod main.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/scanner .

FROM clamav/clamav:stable
USER root
COPY clamd.conf /etc/clamav/clamd.conf
COPY start.sh /opt/dollar-scanner/start.sh
COPY --from=builder /out/scanner /opt/dollar-scanner/scanner
RUN chmod 0755 /opt/dollar-scanner/start.sh /opt/dollar-scanner/scanner
EXPOSE 8080
ENTRYPOINT ["/opt/dollar-scanner/start.sh"]
