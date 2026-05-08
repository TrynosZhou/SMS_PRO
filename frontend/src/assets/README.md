# Assets Directory

This directory contains static assets like images, fonts, and other files that will be served by the Angular application.

## Structure

- Place images in this directory
- Reference them in your components using: `/assets/filename.png`
- Angular will automatically copy these files to the dist folder during build

## Note

If you see 404 errors for assets, make sure:
1. The file exists in this directory
2. You're using the correct path: `/assets/filename.ext`
3. The Angular dev server has been restarted after adding new assets

