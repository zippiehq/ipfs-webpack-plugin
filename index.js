const IPFS = require('ipfs')
const fs = require("fs");
const cheerio = require("cheerio");
const webpack = require("webpack");
const fetch = require('node-fetch');
const dotenv = require('dotenv')
const zutils = require('@zippie/zippie-utils')
const appDirectory = fs.realpathSync(process.cwd());

class IpfsPlugin {
  constructor(wrapper_list = ['index.html', 'manifest.json'], source_dir = 'build') {
    this.wrapper_list = wrapper_list
    this.source_dir = source_dir
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
     
      IPFS.create({repo: '.ipfs-webpack-plugin', start: false}).then(async (ipfs) => {
        this.ipfs = ipfs
        var result = await this.ipfs.addFromFs(
          this.source_dir,
          {
            recursive: true,
            ignore: this.wrapper_list,
            wrapWithDirectory: false
          })

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

          const html = fs.readFileSync(`${appDirectory}/` + this.source_dir + `/index.html`);
          const $ = cheerio.load(html);
          const jsRootHash = filelist[this.source_dir + '/static/js'].hash;
          const cssRootHash = filelist[this.source_dir + '/static/css'].hash;
          $("link[rel=stylesheet]").remove();
          $("script[src*='/static/js']").remove();

          await this.getScriptAssetsDownloadScriptTag(
            jsRootHash,
            cssRootHash,
            $)

          fs.writeFileSync(`${appDirectory}/` + this.source_dir + `/index.html`, $.html());
          result = await this.ipfs.addFromFs(
            this.source_dir,
            {
              recursive: true,
              wrapWithDirectory: false
            })
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
              `${appDirectory}/build-ipfs-filelist.json`,
              JSON.stringify(filelist)
            );          
            console.log('IPFS CID: ' + filelist[this.source_dir].hash) 
            if (process.env.IPFS_WEBPACK_UPLOAD) {
              console.log('Starting IPFS node up..')
              await this.ipfs.start()
              if (process.env.IPFS_WEBPACK_SWARM_CONNECT) {
                console.log('IPFS - connecting to ' + process.env.IPFS_WEBPACK_SWARM_CONNECT)
                await ipfs.swarm.connect(process.env.IPFS_WEBPACK_SWARM_CONNECT)
              }
              if (process.env.IPFS_WEBPACK_CIDHOOK_PINNER && process.env.IPFS_WEBPACK_CIDHOOK_SECRET) {

                function waitTimeout(timeout) {
                  return new Promise((resolve, reject) => {
                    setTimeout(() => {
                      resolve()
                    }, timeout)
                  })
                }

                console.log('Pinning ' + filelist[this.source_dir].hash + ' on ' + process.env.IPFS_WEBPACK_CIDHOOK_PINNER)
                var options = {}
                options['headers'] = { 'Authorization':  process.env.IPFS_WEBPACK_CIDHOOK_SECRET}
                options['method'] = 'POST'
                await fetch(process.env.IPFS_WEBPACK_CIDHOOK_PINNER + '/' + filelist[this.source_dir].hash, options)
                if (process.env.IPFS_WEBPACK_CIDHOOK_WAIT) {
                  var wait = parseInt(process.env.IPFS_WEBPACK_CIDHOOK_WAIT) * 1000
                  console.log('Waiting ' + wait + 'ms for pin to finish')
                  await waitTimeout(wait)
                }
              }
              if (process.env.IPFS_WEBPACK_ZIPPIE_PERMASTORE2_PRIVKEY) {
                console.log('Appending CID to Zippie permastore2')
                let result = await zutils.permastore.insert(filelist[this.source_dir].hash, zutils.signers.secp256k1(process.env.IPFS_WEBPACK_ZIPPIE_PERMASTORE2_PRIVKEY))
                console.log('Available at ' + result.path.split('/')[0])
              }
              console.log('Stopping IPFS node... ')
              await this.ipfs.stop()
            }
            callback();
      }).catch((err) => {
        console.log(err)
      })
//     })
    });
  }
}

module.exports = IpfsPlugin;
