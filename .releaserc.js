/** @type {import('semantic-release').GlobalConfig} */
module.exports = {
  branches: [
    {
      name: 'main',
      channel: 'latest',
    },
    {
      name: 'develop',
      prerelease: 'rc',
      channel: 'next',
    },
    {
      name: 'prerelease/*',
      prerelease: 'pre-${name.replace(/^prerelease\\//g, "")}',
      channel: 'pre-${name.replace(/^prerelease\\//g, "")}',
    },
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md'],
        message: 'chore(release): publish ${nextRelease.name} [skip ci]',
      },
    ],
  ],
};
