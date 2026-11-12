# RAF CONSULT — US18 + US19 Frontend

This is the complete Next.js frontend project for the RAF CONSULT US18 email-result preview and US19 password-recovery screens. It includes the company logo supplied for this project.

## Requirements

- Node.js installed
- npm included with Node.js

## Run in VS Code (Windows PowerShell)

1. Extract this ZIP file.
2. Open the extracted `raf-consult-us19-complete-project` folder in VS Code. Open the folder that directly contains `package.json`.
3. Open **Terminal → New Terminal**.
4. Run:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```

5. Open these routes:
   - Home / US19 forgot password: http://localhost:3000/
   - US19 forgot password: http://localhost:3000/forgot-password
   - US19 reset password: http://localhost:3000/reset-password?token=PASTE_TOKEN_HERE
   - US18 email result preview: http://localhost:3000/us18-demo

Keep the terminal open while using the website. Press `Ctrl + C` in the terminal to stop the development server.

## Company logo

The supplied RAF CONSULT logo is saved as `public/raf-consult-logo.png` and used in the page header. To replace it later, keep the same filename and place the new image in `public`.

## Backend integration (US19)

Create a `.env.local` file in the project root and set the API base URL, for example:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

The frontend expects these endpoints (confirm the final contract with the NestJS teammate):

| Method | Endpoint | JSON body |
|---|---|---|
| POST | `/auth/forgot-password` | `{ "email": "person@example.com" }` |
| POST | `/auth/reset-password` | `{ "token": "...", "password": "..." }` |

The forgot-password endpoint should return a success response with a generic message that does not reveal whether an email address has an account. The backend is responsible for generating a secure, single-use reset token, setting its 15-minute expiry, and sending the email. The reset endpoint must validate the token and enforce the final password policy.

If the backend is not running, the forms display a connection error rather than pretending that an email was sent or a password was changed.

## Notes

- `.next` and `node_modules` are intentionally not included in this ZIP. They are generated locally by Next.js and `npm install`.
- US18 remains a UI preview; its preview controls do not send actual emails.
- Password recovery requires the NestJS API; this frontend alone does not send email or update a real account password.
