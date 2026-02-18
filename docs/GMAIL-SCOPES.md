# Gmail: "Request had insufficient authentication scopes"

Fejlen betyder at din **refresh token** blev udstedt med for få tilladelser. Appen har brug for både at **læse** indbakke/tråde og **sende** mails.

## Løsning: Genautoriser med de rigtige scopes

1. **Åbn OAuth 2.0 Playground**  
   https://developers.google.com/oauthplayground

2. **Klik tandhjulet (øverst til højre)** og afkryds:
   - "Use your own OAuth credentials"
   - **OAuth Client ID:** din `GMAIL_CLIENT_ID`
   - **OAuth Client secret:** din `GMAIL_CLIENT_SECRET`

3. **Vælg scopes**  
   I venstre side, under "Step 1", find **Gmail API v1** og tilføj **begge**:
   - `https://www.googleapis.com/auth/gmail.readonly` – læs indbakke og tråde
   - `https://www.googleapis.com/auth/gmail.send` – send mails  

   Du kan også bruge den bredere scope i stedet for readonly:
   - `https://www.googleapis.com/auth/gmail.modify` (læs + ændre labels)
   - `https://www.googleapis.com/auth/gmail.send`

4. **Klik "Authorize APIs"**  
   Log ind med den Google-konto (Gmail) I bruger til afsendelse, og giv adgang.

5. **Klik "Exchange authorization code for tokens"** (Step 2)  
   Kopiér **Refresh token** og sæt den ind i `.env.local`:
   ```env
   GMAIL_REFRESH_TOKEN=1//0g...
   ```

6. **Genstart appen** (eller reload Outreach-fanen)  
   Gmail-boksen bør nu blive grøn.

---

**Hvis du kun havde `gmail.send` før:**  
Så kan appen sende, men ikke læse indbakke. Tilføj `gmail.readonly` (eller `gmail.modify`) og genautoriser som ovenfor – derefter virker både indbakke og afsendelse.
