/** Metro resolves a bundled sound to its asset id, which expo-audio accepts as a source. */
declare module "*.m4a" {
  const asset: number;
  export default asset;
}
