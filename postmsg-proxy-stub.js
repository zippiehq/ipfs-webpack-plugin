import "regenerator-runtime/runtime";

const Buffer = require('buffer/').Buffer 
import IpfsBridgeClient from "@zippie/ipfs-bridge/src/client";

if (!window.ipfs) {
  window.ipfs = new IpfsBridgeClient()
  window.ipfs.init().then(() => {
    console.info("Zippie IPFS bridge client ready.")
    window.brotli_decompress = true
    window.ipfs_fetch = async function (cid, brotli = false) {
      const chunks = []
      for await (const chunk of window.ipfs.cat(cid)) {
        chunks.push(chunk)
      }
      const contents = Buffer.concat(chunks)
    
      let decompressed = contents
      if (brotli && window.ipfs.brotli_decompress) {
        try {
          const dchunk = []
          for await (const chunk of window.ipfs.brotli_decompress(contents)) {
            dchunk.push(chunk)
          }
          decompressed = Buffer.concat(dchunk)          
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
