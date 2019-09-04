const ipfsClient = require("ipfs-http-client");
const fs = require("fs");
const cheerio = require("cheerio");

class IpfsPlugin {
  constructor(
    host = "localhost",
    port = "5002",
    ipv4Route = "/ip4/127.0.0.1/tcp/4003/ws/ipfs/QmbJtUMhueXwmDZT45NJCdvHmuggMx7mZP4bWNrZVL8TSn"
  ) {
    this.ipfs = ipfsClient(host, port, { protocol: "http" });
    this.ipv4Route = ipv4Route;
  }

  getScriptAssetsDownloadScriptTag(jsRootHash, cssRootHash) {
    const code = `<script>const ipfs = new window.Ipfs({
      config: {
        Bootstrap: [
         "${this.ipv4Route}"
        ]
      }
    });
    ipfs.on("ready", async () => {
      await ipfs.get(
        "${jsRootHash}",
        (err, files) => {
          const jsFiles = files.filter(file => file.type !== "dir" && !file.path.includes("map"));
          jsFiles.map(jsFile => {
            const content = jsFile.content.toString("utf8");
            var myScript = document.createElement("script");
            myScript.setAttribute("type", "text/javascript");
            myScript.innerHTML += content;
            document.body.appendChild(myScript);
          });
        }
      );
      await ipfs.get(
        "${cssRootHash}",
        (err, files) => {
          const jsFiles = files.filter(file => file.type !== "dir" && !file.path.includes("map"));
          jsFiles.map(jsFile => {
            const content = jsFile.content.toString("utf8");
            var styleTag = document.createElement("style");
            styleTag.setAttribute("type", "text/css");
            styleTag.innerHTML += content;
            document.body.appendChild(styleTag);
          });
        }
      );
    });</script>`;
    return code;
  }
  getIpfsScript() {
    return '<script src="https://unpkg.com/ipfs/dist/index.js"></script> ';
  }
  apply(compiler) {
    let publicPath = compiler.options.output.publicPath || "";
    if (publicPath && !publicPath.endsWith("/")) {
      publicPath += "/";
    }
    compiler.hooks.afterEmit.tapAsync("IpfsPlugin", (compilation, callback) => {
      var filelist;

      this.ipfs.addFromFs(
        "./build",
        {
          recursive: true,
          ignore: [
            "asset-manifest",
            "index.html",
            "service-worker.js",
            "service-worker.js",
            "favicon.ico",
            "manifest.json",
            "precache-*.js",
            "robots.txt"
          ],
          wrapWithDirectory: false
        },
        (err, result) => {
          if (err) {
            throw err;
          }
          result.map(file => {
            filelist = {
              ...filelist,
              [file.path]: {
                path: file.path,
                hash: file.hash,
                size: file.size
              }
            };
          });
          const html = fs.readFileSync("./build/index.html");
          const $ = cheerio.load(html);
          const jsRootHash = filelist["build/static/js"].hash;
          const cssRootHash = filelist["build/static/css"].hash;
          $("link[rel=stylesheet]").remove();
          $("script[src*='/static/js']").remove();

          $("head").append(this.getIpfsScript());
          $("head").append(
            this.getScriptAssetsDownloadScriptTag(jsRootHash, cssRootHash)
          );

          fs.writeFileSync("./build/index.html", $.html());
          fs.writeFileSync(`./build/filelist.json`, JSON.stringify(filelist));
        }
      );

      callback();
    });
  }
}

module.exports = IpfsPlugin;
