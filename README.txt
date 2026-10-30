ClinicQ - arrival time feature (full files)
============================================

What this is: the complete, final code of every file changed by the arrival-time
feature ("When can you reach the clinic?" on the token page, and the
"Coming by 5:30 PM" chip for staff). Each file is the full file, not a snippet.

How to use
----------
1) Stop the dev server.
2) Extract this ZIP over D:\My projects\clinic-queue and choose
   "Replace the files in the destination". The folders server, client and
   supabase match the project exactly. client\src\components is a NEW folder.
3) Run supabase\migrations\202609290001_arrival_by.sql once in the Supabase
   SQL editor BEFORE pushing.
4) Restart the server with:  npm run dev
5) Push:
     git add .
     git commit -m "Arrival time"
     git push

Note: this ZIP never contains server\.env (or any other secret).

Files included
--------------
server\schedule.js
server\db.js
server\index.js
client\src\pages\Token.jsx
client\src\pages\Admin.jsx
client\src\components\TimePicker.jsx
client\src\components\ArrivalTime.jsx
supabase\migrations\202609290001_arrival_by.sql
