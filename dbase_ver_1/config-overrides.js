const { override, addBabelPlugins } = require('customize-cra');

module.exports = override(
  ...addBabelPlugins(
    // Add any Babel plugins here, if needed
  )
);
