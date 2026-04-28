import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifestJson = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

manifestJson.version = packageJson.version;
fs.writeFileSync('manifest.json', `${JSON.stringify(manifestJson, null, '\t')}\n`);

let versions = {};
if (fs.existsSync('versions.json')) {
	versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
}

versions[packageJson.version] = manifestJson.minAppVersion;
fs.writeFileSync('versions.json', `${JSON.stringify(versions, null, '\t')}\n`);
