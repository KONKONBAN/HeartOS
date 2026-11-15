const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const R = ResEdit.default ?? ResEdit;
  const exe = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const data = fs.readFileSync(exe);
  const pe = R.NtExecutable.from(data, { ignoreCert: true });
  const res = R.NtExecutableResource.from(pe);
  const ico = R.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'build', 'icon.ico')));
  R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, ico.icons.map((i) => i.data));
  const [vi] = R.Resource.VersionInfo.fromEntries(res.entries);
  const v = ctx.packager.appInfo.version.split('.').map(Number);
  vi.setFileVersion(v[0], v[1], v[2], 0, 1033);
  vi.setProductVersion(v[0], v[1], v[2], 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'HeartOS Sentinel Admin',
    ProductName: 'HeartOS Sentinel Admin',
    CompanyName: 'HeartOS',
    OriginalFilename: `${ctx.packager.appInfo.productFilename}.exe`,
    LegalCopyright: 'HeartOS',
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
};
