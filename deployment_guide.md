# Deployment Guide

The error `Get Pages site failed` indicates that GitHub Pages is not yet enabled or configured correctly for this repository.

## Fix: Enable GitHub Pages for Actions

1.  Go to your repository on GitHub.
2.  Click on the **Settings** tab (top right).
3.  In the left sidebar, click on **Pages** (under the "Code and automation" section).
4.  Under **"Build and deployment"**:
    *   **Source**: Change this from "Deploy from a branch" to **"GitHub Actions"**.
    *   *Note: If "GitHub Actions" is not available, ensure your repository is public or you have a Pro account (for private repos).*
5.  Once selected, the configuration is saved automatically.

## Re-run the Deployment

1.  Go to the **Actions** tab.
2.  Click on the failed "Deploy Jekyll with Plugins" run (or the latest one).
3.  Click **"Re-run jobs"** > **"Re-run all jobs"** (top right).

## Verification

After the action completes successfully (green checkmark):
1.  Go back to **Settings > Pages**.
2.  You will see a message at the top: "Your site is live at..."
3.  Click the link to view your site.
