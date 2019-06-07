const path = require("path");
const HTMLWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = {
  entry: path.join(__dirname, "index.js"),
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js"
  },
  devServer: {
    contentBase: path.resolve(__dirname, "public")
  },
  plugins: [
    new HTMLWebpackPlugin({
      template: path.join(__dirname, "index.html")
    }),
    new webpack.ProvidePlugin({
      THREE: "three"
    })
  ]
};
