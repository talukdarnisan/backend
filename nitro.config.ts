import { version } from "./server/utils/config";
//https://nitro.unjs.io/config
export default defineNitroConfig({
  srcDir: "server",
  compatibilityDate: "2025-03-05",
  runtimeConfig: {
    public: {
      meta: {
        name: process.env.META_NAME || '',
        description: process.env.META_DESCRIPTION || '',
        version: version || '',
        captcha: process.env.CAPTCHA || false,
        captchaClientKey: process.env.CAPTCHA_CLIENT_KEY || ''
      }
    },
    cyrptoSecret: process.env.CRYPTO_SECRET
  }
});