const webpack = require('webpack')

module.exports = {  
  configureWebpack: {
    resolve: {
      extensions: ['.js'],
      alias: {
        'jquery': 'jquery/dist/jquery.js',
      }
    },
    plugins: [
      new webpack.ProvidePlugin({
        '$': 'jquery',
        jQuery: 'jquery',
      })
    ]
  },
  pluginOptions: {
    electronBuilder: {
      name: "Cryptox",
      appId: "com.sampalest.cryptox",
      buildVersion: "1",
      afterSign: "scripts/notarize.js",
      asar: false,
      compression: "normal",
      darkModeSupport: false,
      type: "development",     
      fileAssociations: {
        ext: "ctx",
        name: "CTX",
        role: "Editor",
        description: "Cryptox file encrypted"
      },
      mac: {
        title: "Cryptox",
        name: "Cryptox",
        productName: "Cryptox",
        executableName: "Cryptox",
        category: "public.app-category.utilities",
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: "./entitlements.plist",
        entitlementsInherit: "./entitlements.plist",
        target: [
          "zip",
          "dmg"
        ]
      },
      win: {
        target: "msi"
      },
      linux: {
        target: ["AppImage", "deb", "tar.gz"]
      },
      nodeModulesPath: ['./node_modules']
    },
  }
}