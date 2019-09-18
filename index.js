const ipfsClient = require("ipfs-http-client");
const fs = require("fs");
const cheerio = require("cheerio");
const webpack = require("webpack");

const appDirectory = fs.realpathSync(process.cwd());

class IpfsPlugin {
  constructor(host = "localhost", port = "5002", wrapper_list = ['index.html', 'manifest.json']) {
    this.ipfs = ipfsClient(host, port, { protocol: "http" });
    this.wrapper_list = wrapper_list
  }

  getScriptAssetsDownloadScriptTag(jsRootHash, cssRootHash, $) {
    const code = `
    import { createProxyClient } from "@zippie/ipfs-postmsg-proxy";

    if (!window.ipfs) {
      window.ipfs = createProxyClient({
         postMessage: window.postMessage.bind(window.parent)
      })
    }
    window.ipfs.get(
        "${jsRootHash}"
      ).then((files, err) => {
          const jsFiles = files.filter(file => file.type !== "dir" && !file.path.includes("map"));
          jsFiles.map(jsFile => {
            const content = jsFile.content.toString("utf8");
            var myScript = document.createElement("script");
            myScript.setAttribute("type", "text/javascript");
            myScript.innerHTML += content;
            document.body.appendChild(myScript);
          });
        })
        window.ipfs.get(
        "${cssRootHash}"
        ).then((files, err) => {
          const cssFiles = files.filter(file => file.type !== "dir" && !file.path.includes("map"));
          cssFiles.map(jsFile => {
            const content = jsFile.content.toString("utf8");
            var styleTag = document.createElement("style");
            styleTag.setAttribute("type", "text/css");
            styleTag.innerHTML += content;
            document.head.appendChild(styleTag);
          });
        }
      );
    `;
    fs.writeFileSync(`${appDirectory}/ipfsGetter.js`, code);
    const jsTempPath = `${appDirectory}/ipfsGetter.js`;
    const options = {
      mode: "production",
      watch: false,
      entry: jsTempPath,
      output: {
        path: appDirectory,
        filename: "ipfsGetterBundle.js"
      }
    };
    const compiler = webpack(options);
    return new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err || stats.hasErrors()) {
          console.log(stats.toJson("minimal"));
        }
        const bundle = fs.readFileSync(`${appDirectory}/ipfsGetterBundle.js`);
        $("body").append(`<script>${bundle}</script>`);
        fs.unlinkSync(`${appDirectory}/ipfsGetterBundle.js`);
        fs.unlinkSync(`${appDirectory}/ipfsGetter.js`);
        resolve();
      });
    });
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
          ignore: this.wrapper_list,
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
          const html = fs.readFileSync(`${appDirectory}/build/index.html`);
          const $ = cheerio.load(html);
          const jsRootHash = filelist["build/static/js"].hash;
          const cssRootHash = filelist["build/static/css"].hash;
          $("link[rel=stylesheet]").remove();
          $("script[src*='/static/js']").remove();

          this.getScriptAssetsDownloadScriptTag(
            jsRootHash,
            cssRootHash,
            $
          ).then(() => {
            fs.writeFileSync(`${appDirectory}/build/index.html`, $.html());
            this.ipfs.addFromFs(
              "./build",
              {
                recursive: true,
                wrapWithDirectory: false
              },
              (err, result) => {
                if (err) {
                  throw err;
                }
                var filelist
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
                fs.writeFileSync(
                  `${appDirectory}/build/filelist.json`,
                  JSON.stringify(filelist)
                );    
              })
          });
        }
      );

      callback();
    });
  }
}

module.exports = IpfsPlugin;
