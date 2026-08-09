export {};

declare global {
  interface SubtleCrypto {
    verify(
      algorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams,
      key: CryptoKey,
      signature: Uint8Array<ArrayBufferLike>,
      data: Uint8Array<ArrayBufferLike>,
    ): Promise<boolean>;
  }
}
