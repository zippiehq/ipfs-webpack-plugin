
const PolyfillIPFSScriptSrc = require('./PolyfillIPFSScriptSrc.js')
const IpfsWebpackPlugin = require('./index.js')
module.exports = {
    overrideWebpackConfig: ({ webpackConfig, cracoConfig, pluginOptions, context: { env, paths } }) => {
      webpackConfig.plugins.unshift(new PolyfillIPFSScriptSrc())
      webpackConfig.plugins.push(new IpfsWebpackPlugin())

      // Always return the config object.
      return webpackConfig
    }
};
