export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  freesoundApiKey: process.env.FREESOUND_API_KEY || "",
  cacheTtl: parseInt(process.env.CACHE_TTL || "300", 10) * 1000,
};
