# Social Feed Aggregator

Built with [Droid](https://factory.ai)

A private social media feed aggregator for tracking mentions and content across Twitter, Reddit, and GitHub. Perfect for monitoring brand mentions, competitor activity, or topic-specific content. Runs on GitHub Pages with automated scraping via GitHub Actions.

## Use Cases

- 🏢 **Brand monitoring** - Track mentions of your company/product across social platforms
- 👀 **Competitor analysis** - Monitor competitor activity and announcements
- 📰 **Topic research** - Aggregate content about specific topics or technologies
- 🔍 **Developer relations** - Track community discussions, issues, and feedback
- 📊 **Market research** - Monitor trends, sentiment, and conversations in your industry

## Architecture

**Frontend**: Static HTML/CSS/JS served by GitHub Pages  
**Backend**: Node.js scrapers run via GitHub Actions  
**Data**: Static JSON file updated by Actions  
**Access**: SHA-256 hashed token stored in localStorage

## Setup

### Prerequisites

- Node.js 18+
- GitHub account
- GitHub CLI (`gh`) installed
- API tokens:
  - **GitHub Personal Access Token** (for GitHub GraphQL API)
  - **Apify API Token** (for Twitter scraping)

### Local Development

1. **Clone and install**:
   ```bash
   git clone <your-repo-url>
   cd factory-feed-viewer
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env and add your API tokens
   ```

3. **Run locally**:
   ```bash
   npm start
   # Visit http://localhost:3000
   ```

4. **Test scraper**:
   ```bash
   node src/scraper-cli.js
   # Outputs to public/data/feed.json
   ```

### GitHub Pages Deployment

1. **Create private repository**:
   ```bash
   gh repo create social-feed-aggregator --private --source=. --remote=origin --push
   ```

2. **Add GitHub Secrets** (Settings > Secrets and variables > Actions):
   - `GH_PAT`: Your GitHub Personal Access Token (Note: GitHub doesn't allow secrets starting with `GITHUB_`)
   - `GH_REPO`: GitHub repository to track in format `owner/repo` (e.g., `Factory-AI/factory`)
   - `APIFY_TOKEN`: Your Apify API token for Twitter scraping
   - `TEAM_TWITTER_USERNAMES`: (Optional) Usernames to filter out (e.g., `YourCompanyBot`)

3. **Enable GitHub Pages**:
   - Go to Settings > Pages
   - Source: Deploy from branch `main`
   - Folder: `/docs`
   - Save

4. **Generate access token**:
   ```bash
   echo -n "your_password" | shasum -a 256
   # Copy the hash and update ACCESS_TOKEN_HASH in docs/index.html
   ```

5. **Trigger first scrape**:
   - Go to Actions tab
   - Run "Scrape Feeds" workflow manually
   - Verify `docs/data/feed.json` is created

6. **Access site**:
   - Visit your GitHub Pages URL: `https://<username>.github.io/social-feed-aggregator/`
   - Enter your access token
   - Feed should load!

## Configuration

### Feed Configuration

Edit via Settings UI (⚙️ icon) to configure:

**Hidden Authors** - Filter out posts from specific users:
```json
{
  "hiddenAuthors": ["bentossell", "companybot", "spamaccount"]
}
```

**Feed Sources** - Modify `docs/config.json`:
```json
{
  "twitter": {
    "searchTerms": ["yourcompany", "yourproduct"],
    "excludeUsernames": ["YourCompanyAccount"]
  },
  "reddit": {
    "urls": [
      "https://www.reddit.com/search/?q=yourcompany&type=link&sort=new",
      "https://www.reddit.com/r/YourIndustry/search/?q=yourcompany&restrict_sr=1&sort=new"
    ]
  },
  "github": {
    "usernames": ["yourorg", "competitor1", "competitor2"],
    "topics": ["ai", "llm", "machine-learning"]
  }
}
```

### Scraping Frequency

Edit `.github/workflows/scrape-feeds.yml`:

```yaml
schedule:
  - cron: '*/10 * * * *'  # Every 10 minutes
  # Change to '*/30 * * * *' for every 30 minutes (recommended for free tier)
```

### Access Token

To change the access password:

```bash
echo -n "new_password" | shasum -a 256
```

Update `ACCESS_TOKEN_HASH` in `public/index.html` with the new hash.

## Usage

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `J` / `↓` | Navigate down |
| `K` / `↑` | Navigate up |
| `X` | Select/deselect current item |
| `Shift+X` | Toggle multi-select mode |
| `E` | Archive selected items |
| `Enter` | Open focused item |
| `Cmd/Ctrl+Enter` | Open in new tab |
| `R` | Refresh feed |
| `Esc` | Clear selection |
| `Cmd/Ctrl+K` | Toggle commands help |
| `←` | Collapse sidebar |
| `→` | Expand sidebar |

### Mouse & Touch Actions

- **Click card**: Select/deselect (or open in multi-select mode)
- **Shift+Click**: Range select (like Excel)
- **Cmd/Ctrl+Click**: Open URL in new tab
- **Click source pill**: Filter by Twitter/Reddit/GitHub
- **Click category pill**: Filter by mentions/bugs/love/questions
- **Click sidebar overlay (mobile)**: Close sidebar

## API Rate Limits

| Service | Limit | Notes |
|---------|-------|-------|
| GitHub | 5,000 req/hr | Authenticated GraphQL |
| Reddit | ~60 req/min | Public feeds |
| Twitter | Via Apify | Check usage dashboard |
| GitHub Actions | 2,000 min/month | Free tier |

## Security

- ✅ `.env` is gitignored
- ✅ All secrets in GitHub Secrets
- ✅ Access token is SHA-256 hashed
- ✅ Private repository
- ✅ No API keys in code or commits

See `AGENTS.md` for detailed security practices.

## Maintenance

**Weekly**: Check Actions tab for successful runs  
**Monthly**: Update dependencies (`npm update`)  
**As needed**: Rotate tokens if compromised

## Troubleshooting

### Feed not updating?
- Check Actions tab for errors
- Verify GitHub Secrets are set correctly
- Clear browser cache

### Can't access site?
- Verify access token hash matches
- Check GitHub Pages is enabled
- Try incognito/private browsing mode

### Scraper failing?
- Check API tokens are valid
- Verify rate limits not exceeded
- Review Actions logs for errors

## Contributing

We welcome contributions! Whether it's bug fixes, new features, documentation improvements, or new scrapers - all PRs are appreciated.

See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- How to set up your development environment
- Code style guidelines
- How to add new scrapers
- Pull request process

Quick start:
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

For questions or discussions, open an [issue](https://github.com/bentossell/ccc-new/issues).

## License

ISC
