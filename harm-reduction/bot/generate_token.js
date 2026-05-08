const http = require('http');
const url = require('url');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.env.stdin,
  output: process.env.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("=== Reddit Bot OAuth Token Generator ===");
  console.log("1. Go to https://www.reddit.com/prefs/apps");
  console.log("2. Create a 'web app'");
  console.log("3. Set redirect uri to: http://localhost:8080\n");

  const clientId = await question("Enter your Client ID: ");
  const clientSecret = await question("Enter your Client Secret: ");

  const state = Math.random().toString(36).substring(7);
  const scope = "read submit edit history identity";
  
  const authUrl = `https://www.reddit.com/api/v1/authorize?client_id=${clientId}&response_type=code&state=${state}&redirect_uri=http://localhost:8080&duration=permanent&scope=${encodeURIComponent(scope)}`;

  console.log("\n==================================================");
  console.log("Please click the link below to authorize the bot:");
  console.log(authUrl);
  console.log("==================================================\n");
  console.log("Waiting for authorization...");

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/') {
      if (parsedUrl.query.error) {
        res.end(`Error: ${parsedUrl.query.error}`);
        console.error("Authorization failed:", parsedUrl.query.error);
        process.exit(1);
      }

      if (parsedUrl.query.code) {
        res.end("Authorization successful! You can close this tab and check your terminal.");
        
        try {
          const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
            method: "POST",
            headers: {
              "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code: parsedUrl.query.code,
              redirect_uri: "http://localhost:8080"
            })
          });

          const data = await tokenRes.json();
          
          if (data.refresh_token) {
            console.log("\n✅ SUCCESS! Here is your Refresh Token:\n");
            console.log(data.refresh_token);
            console.log("\nSet this as REDDIT_REFRESH_TOKEN in your GitHub Secrets or .env file.");
            console.log("You no longer need your Reddit Username or Password in the secrets.");
          } else {
            console.error("\n❌ Failed to get refresh token. Response from Reddit:");
            console.error(data);
          }
        } catch (err) {
          console.error("Error exchanging code for token:", err);
        }
        
        process.exit(0);
      }
    }
  });

  server.listen(8080, () => {
    // Server running
  });
}

main().catch(console.error);
