# Legacy Data Access Inventory

Generated without querying production data. This inventory is static analysis only.

## Firestore, Firebase Auth, and Cloudinary touch points

| File | Line | Service | Kind | Target | Summary |
| --- | --- | --- | --- | --- | --- |
| JS/AccountInfo.js | 137 | auth | session | (dynamic or indirect target) | Subscribe to auth state changes |
| JS/AccountInfo.js | 149 | firestore | read | users | Fetch a single document |
| JS/AccountInformation.js | 175 | auth | session | (dynamic or indirect target) | Subscribe to auth state changes |
| JS/AccountInformation.js | 215 | firestore | read | users | Fetch a single document |
| JS/AccountInformation.js | 220 | firestore | read | responders | Fetch a single document |
| JS/AllReports.js | 27 | auth | session | (dynamic or indirect target) | Subscribe to auth state changes |
| JS/AllReports.js | 52 | firestore | read | floodReports | Subscribe to live Firestore updates |
| JS/AllReports.js | 57 | firestore | read | helpRequests | Subscribe to live Firestore updates |
| JS/AllReports.js | 165 | firestore | write | (dynamic or indirect target) | Update an existing document |
| JS/Dashboard.js | 142 | firestore | read | floodReports | Fetch a collection query |
| JS/Dashboard.js | 143 | firestore | read | helpRequests | Fetch a collection query |
| JS/Dashboard.js | 187 | firestore | read | evacuationCenters | Fetch a collection query |
| JS/Homepage.js | 8 | auth | session | (dynamic or indirect target) | Subscribe to auth state changes |
| JS/Homepage.js | 19 | firestore | read | users | Fetch a single document |
| JS/Homepage.js | 26 | firestore | read | responders | Fetch a single document |
| JS/Homepage.js | 56 | auth | write | (dynamic or indirect target) | Sign out the current user |
| JS/Homepage.js | 337 | firestore | read | floodReports | Fetch a collection query |
| JS/Homepage.js | 338 | firestore | read | helpRequests | Fetch a collection query |
| JS/Hotline.js | 134 | firestore | read | (dynamic or indirect target) | Fetch a single document |
| JS/Hotline.js | 142 | firestore | write | (dynamic or indirect target) | Create or replace a document |
| JS/Hotline.js | 149 | firestore | read | (dynamic or indirect target) | Subscribe to live Firestore updates |
| JS/Hotline.js | 178 | firestore | read | (dynamic or indirect target) | Fetch a single document |
| JS/Hotline.js | 280 | firestore | write | (dynamic or indirect target) | Generate a server timestamp in a write payload |
| JS/Hotline.js | 341 | firestore | query | (dynamic or indirect target) | Compose a Firestore query |
| JS/Hotline.js | 341 | firestore | query | (dynamic or indirect target) | Filter a Firestore query |
| JS/Hotline.js | 342 | firestore | read | (dynamic or indirect target) | Fetch a collection query |
| JS/Hotline.js | 438 | firestore | write | (dynamic or indirect target) | Generate a server timestamp in a write payload |
| JS/Hotline.js | 442 | firestore | write | (dynamic or indirect target) | Create a document with an auto ID |
| JS/Hotline.js | 479 | firestore | write | (dynamic or indirect target) | Delete a document |
| JS/Hotline.js | 503 | auth | session | (dynamic or indirect target) | Subscribe to auth state changes |
| JS/Hotline.js | 513 | firestore | read | (dynamic or indirect target) | Fetch a single document |
| JS/Login.js | 63 | auth | write | (dynamic or indirect target) | Sign in with email and password |
| JS/Login.js | 89 | auth | write | (dynamic or indirect target) | Send password reset email |
| JS/Loginresponder.js | 59 | auth | write | (dynamic or indirect target) | Sign in with email and password |
| JS/Loginresponder.js | 64 | firestore | read | responders | Fetch a single document |
| JS/Loginresponder.js | 101 | auth | write | (dynamic or indirect target) | Send password reset email |
| JS/MyReports.js | 104 | auth | session | (dynamic or indirect target) | Subscribe to auth state changes |
| JS/MyReports.js | 126 | firestore | read | floodReports | Subscribe to live Firestore updates |
| JS/MyReports.js | 131 | firestore | read | helpRequests | Subscribe to live Firestore updates |
| JS/MyReports.js | 160 | firestore | write | (dynamic or indirect target) | Delete a document |
| JS/MyReports.js | 173 | firestore | write | (dynamic or indirect target) | Update an existing document |
| JS/MyReports.js | 197 | firestore | read | (dynamic or indirect target) | Fetch a single document |
| JS/MyReports.js | 205 | firestore | read | (dynamic or indirect target) | Fetch a single document |
| JS/ReportFlood.js | 17 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/ReportFlood.js | 175 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/ReportFlood.js | 176 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/ReportFlood.js | 180 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/ReportFlood.js | 240 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/ReportFlood.js | 243 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/ReportFlood.js | 248 | firestore | read | users | Fetch a single document |
| JS/ReportFlood.js | 250 | firestore | read | responders | Fetch a single document |
| JS/ReportFlood.js | 254 | firestore | write | floodReports | Create a document with an auto ID |
| JS/ReportFlood.js | 289 | auth | session | (dynamic or indirect target) | Subscribe to auth state changes |
| JS/RequestHelp.js | 15 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/RequestHelp.js | 158 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/RequestHelp.js | 159 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/RequestHelp.js | 163 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/RequestHelp.js | 221 | cloudinary | upload | unsigned image upload endpoint | Uploads files directly from the browser to Cloudinary. |
| JS/RequestHelp.js | 226 | firestore | read | users | Fetch a single document |
| JS/RequestHelp.js | 228 | firestore | read | responders | Fetch a single document |
| JS/RequestHelp.js | 233 | firestore | write | helpRequests | Create a document with an auto ID |
| JS/RequestHelp.js | 266 | auth | session | (dynamic or indirect target) | Subscribe to auth state changes |
| JS/responderhomepage.js | 15 | auth | session | (dynamic or indirect target) | Subscribe to auth state changes |
| JS/responderhomepage.js | 20 | firestore | read | responders | Fetch a single document |
| JS/responderhomepage.js | 64 | auth | write | (dynamic or indirect target) | Sign out the current user |
| JS/responderhomepage.js | 129 | firestore | read | floodReports | Fetch a collection query |
| JS/responderhomepage.js | 130 | firestore | read | helpRequests | Fetch a collection query |
| JS/signup.js | 65 | auth | write | (dynamic or indirect target) | Create authentication account |
| JS/signup.js | 69 | firestore | write | users | Create or replace a document |
| JS/Signupresponder.js | 127 | auth | write | (dynamic or indirect target) | Create authentication account |
| JS/Signupresponder.js | 145 | firestore | write | responders | Create or replace a document |
| JS/VerAcc.js | 118 | auth | write | (dynamic or indirect target) | Create authentication account |
| JS/VerAcc.js | 136 | firestore | write | responders | Create or replace a document |

## Collections and documents referenced

- `evacuationCenters`
- `floodReports`
- `helpRequests`
- `responders`
- `unsigned image upload endpoint`
- `users`
