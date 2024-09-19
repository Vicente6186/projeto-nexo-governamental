const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

module.exports = {
    mode: 'development',
    entry: './js/index.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist'),
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: [MiniCssExtractPlugin.loader, "style-loader", "css-loader"],
            },
            {
                test: /\.(?:js|mjs|cjs)$/,
                exclude: /node_modules/,
                use: {
                  loader: 'babel-loader',
                  options: {
                    targets: "defaults",
                    presets: [
                      ['@babel/preset-env']
                    ]
                  }
                }
            }
        ],
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: "./css", to: "css" },
                { from: "./assets", to: "assets" },
            ],
        }),
        new HtmlWebpackPlugin({
            template: './index.html',
            favicon: './assets/home/brand.svg',
            inject: 'body',
        }),
        new MiniCssExtractPlugin()
    ],
    devServer: {
        static: './dist',
        open: true,
        watchFiles: ['./index.html', './src'], 
    },
    optimization: {
        minimizer: [
          new CssMinimizerPlugin(),
        ],
        minimize: true
      },
};