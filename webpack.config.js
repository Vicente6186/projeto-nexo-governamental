const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

module.exports = {
    mode: 'development',
    entry: './src/js/index.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: [MiniCssExtractPlugin.loader, "css-loader"],
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
                {
                    from: "./src/assets",
                    to: "assets",
                    globOptions: {
                        ignore: [
                            "**/objective.webm",
                            "**/thinking-no-background.webm",
                            "**/introduction/brand-without-background.svg",
                            "**/favicon.png",
                        ],
                    },
                },
                { from: "./src/sitemap.xml" },
                { from: "./src/robots.txt" },
                { from: "./src/google42b90ef871b3befd.html" },
            ],
        }),
        new HtmlWebpackPlugin({
            template: './src/index.html',
            inject: 'body',
        }),
        new MiniCssExtractPlugin()
    ],
    devServer: {
        static: './dist',
        open: true,
        watchFiles: ['./src'], 
    },
    optimization: {
        minimizer: [
            new CssMinimizerPlugin(),
        ],
        minimize: true
    },
};
