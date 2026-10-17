// Metro في المستودع الواحد: يراقب الجذر ليجد @raqeem/shared، ويبحث عن الحزم في node_modules للتطبيق ثم الجذر
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// خطوط ثمانية بصيغة otf
if (!config.resolver.assetExts.includes('otf')) config.resolver.assetExts.push('otf');

module.exports = config;
