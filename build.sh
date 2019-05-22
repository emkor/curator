#!/usr/bin/env bash

set -e

echo "Cleanup..."
rm -rf dep
rm -rf dist

echo "Copying dependencies..."
mkdir -p dep
cp node_modules/bootswatch/dist/darkly/bootstrap.min.css dep
cp -R node_modules/font-awesome/css dep
cp node_modules/tablesort/tablesort.css dep
cp node_modules/jquery/dist/jquery.min.js dep
cp node_modules/popper.js/dist/umd/popper.min.js dep
cp node_modules/bootstrap/dist/js/bootstrap.min.js dep
cp node_modules/vue/dist/vue.min.js dep
cp node_modules/tablesort/dist/tablesort.min.js dep
cp node_modules/tablesort/dist/sorts/tablesort.number.min.js dep
cp -R node_modules/font-awesome/fonts dep

echo "Building distribution..."
mkdir -p dist
cp -R dep dist
cp -R src dist
cp index.html dist

echo "Done! Don't forget to edit dist/src/cfg.js"