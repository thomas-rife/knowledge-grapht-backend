import app from "./src/index.js";

export const maxDuration = 60;

export default async (req, res) => {
  // Let Express handle the request
  return app(req, res);
};
