export function resolvePath(basePath: string, relativePath: string): string {
  try {
    const baseParts = basePath.split('/');
    baseParts.pop(); // Remove the current file name to get its directory

    // If it's an absolute path (from the root of the selected folder)
    // We assume the first part of baseParts is the root folder name.
    if (relativePath.startsWith('/')) {
      return `${baseParts[0]}${relativePath}`;
    }

    const relParts = relativePath.split('/');
    for (const p of relParts) {
      if (p === '..') {
        baseParts.pop();
      } else if (p !== '.' && p !== '') {
        baseParts.push(p);
      }
    }

    return baseParts.join('/');
  } catch (e) {
    return relativePath;
  }
}
