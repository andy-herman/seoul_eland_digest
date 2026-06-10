param(
    [string]$ProjectDir = "C:\Andy Herman\Coding Projects (Local)\seoul_eland_digest",
    [string]$SiteUrl = "https://seoul-eland-digest.vercel.app",
    [string]$Remote = "origin",
    [string]$Branch = "main",
    [switch]$DirectVercelDeploy
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

Set-Location $ProjectDir

if (-not (Test-Path "site\package.json")) {
    throw "Cannot find site\package.json under $ProjectDir"
}

$insideWorkTree = git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0 -or $insideWorkTree.Trim() -ne "true") {
    throw "$ProjectDir is not a git repository."
}

$gitName = git config user.name
$gitEmail = git config user.email
if (-not $gitName -or -not $gitEmail) {
    throw "Missing repo-local git user.name or user.email. Configure them before scheduled publishing."
}

Write-Step "Building Astro site for Vercel root deployment..."
$env:SITE_URL = $SiteUrl
Remove-Item Env:\SITE_BASE -ErrorAction SilentlyContinue

Push-Location "site"
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Site build failed."
    }
}
finally {
    Pop-Location
}

Write-Step "Staging public website files..."
git add vercel.json .github\workflows\deploy-pages.yml .gitignore site

$stagedFiles = git diff --cached --name-only
if ($stagedFiles) {
    Write-Step "Committing website update..."
    git commit `
        -m "Update published Seoul E-Land site" `
        -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
    if ($LASTEXITCODE -ne 0) {
        throw "Git commit failed."
    }

    Write-Step "Pushing to $Remote/$Branch for Vercel Git deployment..."
    git push $Remote $Branch
    if ($LASTEXITCODE -ne 0) {
        throw "Git push failed."
    }
}
else {
    Write-Step "No public website changes to commit."
}

if ($DirectVercelDeploy -or $env:VERCEL_DEPLOY_DIRECT -eq "1") {
    if (-not $env:VERCEL_TOKEN) {
        throw "Direct Vercel deploy requested, but VERCEL_TOKEN is not set."
    }

    Write-Step "Running direct Vercel production deploy..."
    npx vercel --prod --yes --token $env:VERCEL_TOKEN
    if ($LASTEXITCODE -ne 0) {
        throw "Vercel production deploy failed."
    }
}
else {
    Write-Step "Publish step complete. If the GitHub repo is connected in Vercel, the push will trigger production deployment."
}
