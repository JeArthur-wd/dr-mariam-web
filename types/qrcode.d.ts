declare module 'qrcode' {
  type QRCodeOptions = {
    width?: number
    margin?: number
    color?: {
      dark?: string
      light?: string
    }
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
    type?: 'image/png' | 'image/jpeg' | 'image/webp'
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeOptions): Promise<string>
  }

  export default QRCode
}
