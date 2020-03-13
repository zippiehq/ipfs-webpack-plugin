import "core-js/stable";
import "regenerator-runtime/runtime";

const Buffer = require('buffer/').Buffer 
import IpfsBridgeClient from "@zippie/ipfs-bridge/src/client";
import { BrotliDecompressBuffer as decompress } from "@zippie/brotli/dec/decode";


window.brotli_decompress = function (content) {
  return Buffer.from(decompress(content))
}


if (!window.ipfs) {
  window.ipfs = new IpfsBridgeClient()
  window.ipfs.init().then(() => {
    console.info("Zippie IPFS bridge client ready.")

    window.ipfs_fetch = async function (cid, brotli = false) {
      const chunks = []
      for await (const chunk of window.ipfs.cat(cid)) {
        chunks.push(chunk)
      }
      const contents = Buffer.concat(chunks)
    
      let decompressed = contents
      if (brotli) {
        try {
          decompressed = Buffer.from(window.brotli_decompress(decompressed))
          console.log('decompress ok')
        } catch (err) {
          console.log(err)
        }
      }
      return decompressed
    }
    
    window.ipfs_stub_loaded = true
    window.ipfs_ready = function() {
       return new Promise((resolve, reject) => {
          resolve()
       })
    }
    window.ipfs_stub_callback()
  })
}
