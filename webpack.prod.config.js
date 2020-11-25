const path = require('path')
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin")
var Crx = require("crx-webpack-plugin")

module.exports = {
  entry: {
    background: [path.join(__dirname, 'src/background/index')],
  },
  resolve: {
    extensions: ['*', '.js']
  },
  output: {
    path: path.join(__dirname, '/dist'),
    filename: '[name].bundle.js',
    chunkFilename: '[id].chunk.js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre"
      }
    ]
  },
  plugins: [
    new webpack.SourceMapDevToolPlugin({
      filename: '[name].js.map',
    }),
    new Crx({
      keyFile: 'key.pem',
      contentPath: 'dist',
      outputPath: 'ctx',
      name: 'gcp-shortcuts'
    })
  ],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({
      minify: (file, sourceMap) => {
        const uglifyJsOptions = {};
        if (sourceMap) {
          uglifyJsOptions.sourceMap = {
            content: sourceMap,
          };
        }

        return require("terser").minify(file, uglifyJsOptions);
      }
    })],
  }
}