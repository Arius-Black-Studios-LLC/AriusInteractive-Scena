import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

const LEGACY_JS = [
  "scena-auth.js",
  "scena-cloud.js",
  "scena-profile.js",
  "scena-account.js",
  "scena-catalog.js",
  "scena-demo-series.js",
  "scena-progress.js",
  "scena-player.js",
  "scena-comments.js",
  "scena-hearts.js",
  "scena-audio.js",
  "scena-reader-menu.js",
  "scena-default-audio.js",
  "scena-key-item.js",
  "scena-key-item-icons.js",
  "scena-badges.js",
  "scena-wallet.js",
  "scena-marketplace.js",
  "scena-feedback.js",
  "studio-store.js",
  "studio-app.js",
  "studio-graph.js",
  "learn-app.js",
  "learn-lessons.js",
  "learn-sandbox.js",
  "learn-mascots.js",
  "scena-logo.js",
];

const LEGACY_CSS = [
  "studio.css",
  "play.css",
  "series.css",
  "learn.css",
  "scena-page.css",
  "scena-logo.css",
  "arleco-theme.css",
  "blog.css",
];

function copyLegacyFromDocs(): Plugin {
  const docsDir = path.resolve(__dirname, "../docs");
  const legacyDir = path.resolve(__dirname, "public/legacy");
  const blogSrc = path.join(docsDir, "blog");
  const blogDst = path.resolve(__dirname, "public/blog");

  function sync() {
    fs.mkdirSync(legacyDir, { recursive: true });
    for (const file of [...LEGACY_JS, ...LEGACY_CSS]) {
      const src = path.join(docsDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(legacyDir, file));
      }
    }
    const configSrc = path.join(docsDir, "scena-config.js");
    if (fs.existsSync(configSrc)) {
      fs.copyFileSync(configSrc, path.join(legacyDir, "scena-config.js"));
    }
    const iconSrc = path.join(docsDir, "arleco-icon.png");
    if (fs.existsSync(iconSrc)) {
      fs.copyFileSync(iconSrc, path.resolve(__dirname, "public/arleco-icon.png"));
    }
    if (fs.existsSync(blogSrc)) {
      fs.rmSync(blogDst, { recursive: true, force: true });
      fs.mkdirSync(blogDst, { recursive: true });
      for (const name of fs.readdirSync(blogSrc)) {
        const srcFile = path.join(blogSrc, name);
        const dstFile = path.join(blogDst, name);
        if (name.endsWith(".html")) {
          const html = fs.readFileSync(srcFile, "utf8");
          const rewritten = html
            .replace(/href="\.\.\/([^"?]+)(\?[^"]*)?"/g, 'href="/legacy/$1$2"')
            .replace(/src="\.\.\/([^"?]+)(\?[^"]*)?"/g, 'src="/legacy/$1$2"');
          fs.writeFileSync(dstFile, rewritten);
        } else {
          fs.copyFileSync(srcFile, dstFile);
        }
      }
    }
  }

  return {
    name: "copy-legacy-from-docs",
    buildStart: sync,
    configureServer: sync,
  };
}

export default defineConfig({
  plugins: [react(), copyLegacyFromDocs()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
