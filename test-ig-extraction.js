
const https = require('https');

// Let's test with your example URL
const TEST_URL = 'https://www.instagram.com/iaminamarlene/?hl=en';
const MAX_BYTES = 524288; // 512KB, like we updated

// First, let's fetch the page HTML
function fetchInstagramPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, (res) => {
      let data = '';
      let bytesRead = 0;
      res.on('data', (chunk) => {
        if (bytesRead + chunk.length > MAX_BYTES) {
          data += chunk.subarray(0, MAX_BYTES - bytesRead);
          bytesRead = MAX_BYTES;
          res.destroy();
        } else {
          data += chunk;
          bytesRead += chunk.length;
        }
      });
      res.on('end', () => {
        console.log(`✅ Fetched ${bytesRead.toLocaleString()} bytes from ${url}`);
        resolve(data);
      });
    }).on('error', reject);
  });
}

// This is the same scoring logic from our code
function calculateInstagramScore(url, baseScore) {
  let score = baseScore;
  if (!/stp=/i.test(url)) score += 200;
  if (/fbcdn\.net/i.test(url)) score += 10000;
  if (!/\/[sep]\d+(x\d+)?\//i.test(url)) score += 100;
  return score;
}

async function main() {
  try {
    const html = await fetchInstagramPage(TEST_URL);
    
    console.log('\n🔍 Scanning for Instagram profile URLs...\n');
    
    // Collect ALL profile-related URLs from the HTML
    const allMatches = [];
    const addMatch = (url, label, baseScore) => {
      const decodedUrl = url.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      allMatches.push({
        url: decodedUrl,
        label,
        baseScore,
        finalScore: calculateInstagramScore(decodedUrl, baseScore)
      });
    };
    
    // 1. Look for profile_pic_url_hd (highest priority base score: 5000)
    const profilePicHdRegex = /"profile_pic_url_hd":"([^"]+)"/gi;
    let match;
    while ((match = profilePicHdRegex.exec(html)) !== null) {
      addMatch(match[1], 'profile_pic_url_hd', 5000);
    }
    
    // 2. Look for profilePicUrlHd (base: 4900)
    const profilePicUrlHdRegex = /"profilePicUrlHd":"([^"]+)"/gi;
    while ((match = profilePicUrlHdRegex.exec(html)) !== null) {
      addMatch(match[1], 'profilePicUrlHd', 4900);
    }
    
    // 3. Look for profile_pic_url (base: 4800)
    const profilePicRegex = /"profile_pic_url":"([^"]+)"/gi;
    while ((match = profilePicRegex.exec(html)) !== null) {
      addMatch(match[1], 'profile_pic_url', 4800);
    }
    
    // 4. Look for profilePicUrl (base: 4700)
    const profilePicUrlRegex = /"profilePicUrl":"([^"]+)"/gi;
    while ((match = profilePicUrlRegex.exec(html)) !== null) {
      addMatch(match[1], 'profilePicUrl', 4700);
    }
    
    // 5. Look for og:image (base: 2000)
    const ogImageRegex = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi;
    while ((match = ogImageRegex.exec(html)) !== null) {
      addMatch(match[1], 'og:image', 2000);
    }
    
    // Now let's sort them and show the results
    allMatches.sort((a, b) => b.finalScore - a.finalScore);
    console.log(`📊 Found ${allMatches.length} candidate URLs!\n`);
    
    // Split into fbcdn and non-fbcdn groups for clarity
    const fbcdnCandidates = allMatches.filter(x => /fbcdn\.net/i.test(x.url));
    const otherCandidates = allMatches.filter(x => !/fbcdn\.net/i.test(x.url));
    
    if (fbcdnCandidates.length > 0) {
      console.log(`💎 Found ${fbcdnCandidates.length} fbcdn.net URLs (HIGHEST PRIORITY):`);
      fbcdnCandidates.slice(0, 3).forEach((c, idx) => {
        console.log(`  ${idx+1}. Score: ${c.finalScore} (${c.label})`);
        console.log(`     ${c.url}\n`);
      });
    }
    
    if (otherCandidates.length > 0) {
      console.log(`🔵 Found ${otherCandidates.length} other URLs:`);
      otherCandidates.slice(0, 3).forEach((c, idx) => {
        console.log(`  ${idx+1}. Score: ${c.finalScore} (${c.label})`);
        console.log(`     ${c.url}\n`);
      });
    }
    
    // Show what our code would pick
    if (allMatches.length > 0) {
      const chosen = fbcdnCandidates.length > 0 ? fbcdnCandidates[0] : allMatches[0];
      console.log(`🏆 Our code would choose: (Score: ${chosen.finalScore})`);
      console.log(`   ${chosen.url}`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

main();
