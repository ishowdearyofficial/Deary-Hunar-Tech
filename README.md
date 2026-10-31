m# Deary Tech

Deary Tech is a small computer-learning website with an AI chat tutor. The Node.js server serves the website and connects to Google Gemini or OpenAI.

## Run locally

1. Install [Node.js 20 or newer](https://nodejs.org/), then restart VS Code so its terminal can find `node` and `npm`.
2. Create a Gemini API key at <https://aistudio.google.com/app/apikey> or an OpenAI API key at <https://platform.openai.com/api-keys>. Check the provider's usage and billing limits.
3. Start the website from PowerShell in this project folder:

   ```powershell
   npm start
   ```

4. Open <http://localhost:3000>. **Do not use VS Code Live Server** (`127.0.0.1:5500`): it serves static files only and cannot run the AI backend.

Click **Add API key**, choose **Google Gemini** or **OpenAI**, paste the matching key, and select **Use key**. The page keeps the key in memory only until you close or reload the page. It sends the key to this server for provider authorization; the key is not saved in browser storage or included in the chat. Only enter your key on a site you trust.

For server-side configuration instead, set `GEMINI_API_KEY` or `OPENAI_API_KEY` in the server environment. Gemini uses `gemini-2.5-flash` by default; set `GEMINI_MODEL` to override it. OpenAI uses `gpt-4.1-mini` by default; set `OPENAI_MODEL` to override it. Keep keys private: never put them in `index.html`, `main.css`, or `D.js`, and never commit them.

The chat sends your question and recent conversation to the selected provider to generate a reply. The API key is sent separately as authorization and is not included in the conversation. Do not enter passwords or other sensitive information. AI answers can be inaccurate.

## Publish the website

The included `render.yaml` configures a Node.js web service on Render. To publish:

1. Create a **private** repository on GitHub and upload the project files. Do not upload API keys or `.env` files; `.gitignore` excludes those.
2. Sign in to Render, choose **New → Blueprint**, connect GitHub, and select this repository. Approve access to the private repository if prompted.
3. Review the service settings from `render.yaml` and deploy. Render builds with `npm install` and starts with `npm start`.
4. When deployment finishes, open the HTTPS URL Render gives you. The AI chat will ask each visitor to enter their own Gemini or OpenAI key; do not configure your personal key as a shared server key on a public site.
5. To help the site appear in Google Search, add its public HTTPS URL in [Google Search Console](https://search.google.com/search-console) and request indexing. Google may take time to list it and does not guarantee a particular ranking.

Render's free service may sleep when idle and take a while to wake. Never publish API keys in the GitHub repository, source files, or a public webpage.
