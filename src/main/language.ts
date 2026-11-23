const { execFile } = require("node:child_process");
const { nativeHelperPath } = require("./dictionary");

async function detectLanguage(text) {
  const value = String(text || "").trim();
  if (!value) return "en";
  return new Promise((resolve, reject) => {
    execFile(nativeHelperPath(), ["--language", value], {
      timeout: 3000, maxBuffer: 1024,
    }, (error, stdout) => {
      if (error) return reject(new Error("Could not detect the input language. Try again."));
      const language = stdout.trim();
      if (language !== "en" && language !== "fr") {
        return reject(new Error("Could not detect the input language. Try again."));
      }
      resolve(language);
    });
  });
}

module.exports = { detectLanguage };
