
const { loaderByName, addBeforeLoader } = require('@craco/craco')
const PolyfillIPFSScriptSrc = require('./PolyfillIPFSScriptSrc.js')
const IpfsWebpackPlugin = require('./index.js')
const base64Loader = require('./craco-base64-inline-loader.js')

module.exports = {
    overrideCracoConfig: ({ cracoConfig, pluginOptions, context: { env, paths } }) => { 
      cracoConfig.plugins.push(
      { 
        plugin: base64Loader,
        options: {
          test: /\.(svg?)$/i,
          limit: 99999999999999999999,
        }
      })
      return cracoConfig
    },
    overrideWebpackConfig: ({ webpackConfig, cracoConfig, pluginOptions, context: { env, paths } }) => {
      if (!(process.env.IPFS_WEBPACK_DISABLE && process.env.IPFS_WEBPACK_DISABLE === '1')) {
         webpackConfig.plugins.unshift(new PolyfillIPFSScriptSrc())
         webpackConfig.plugins.push(new IpfsWebpackPlugin())
      }
      // Always return the config object.
      return webpackConfig
    }
};
