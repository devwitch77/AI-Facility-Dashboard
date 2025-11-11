// src/cityScenes.js
export const CITY_CONFIGS = {
  Dubai: {
    name: "Dubai",
    palette: {
      base: "#0b0f0d",
      ground: "#0b0b0b",
      block: "#18392B",
      accent: "#8FE3B3",
      warn: "#F59E0B",
      danger: "#EF4444",
    },
    ambient: "#1b3d2f",     
    dirIntensity: 0.9,
    rotationSpeed: 0.0020,
    beaconBaseIntensity: 0.7,
  },
  London: {
    name: "London",
    palette: {
      base: "#0d0a13",
      ground: "#0a0910",
      block: "#2C1F42",
      accent: "#C2A9FF",
      warn: "#EAB308",
      danger: "#EF4444",
    },
    ambient: "#3b2a57",     
    dirIntensity: 0.85,
    rotationSpeed: 0.0016,
    beaconBaseIntensity: 0.65,
  },
  Tokyo: {
    name: "Tokyo",
    palette: {
      base: "#0d0a0a",
      ground: "#0a0a0a",
      block: "#341F1F",
      accent: "#FFC266",
      warn: "#F59E0B",
      danger: "#FF4D4D",
    },
    ambient: "#5a1a1a",     
    dirIntensity: 0.95,
    rotationSpeed: 0.0026,
    beaconBaseIntensity: 0.75,
  },
};
