# Local setup

The project uses two development servers. Run each command in a separate terminal.

## Backend

From the repository root:

```sh
cd backend
source venv/bin/activate
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The local environment uses Python 3.11. Dependencies are installed in `backend/venv`.

Edit `backend/.env` and provide your own values for:

- `GROQ_API_KEY`: resume assessment, interview questions, and reports.
- `NVIDIA_API_KEY`: required by the assessment route; also used for scanned PDF extraction.
- `DEEPGRAM_API_KEY`: the separate backend voice pipeline.
- `GITHUB_TOKEN`: repository downloads, if you use that backend feature.

API status: <http://127.0.0.1:8000/>.
API documentation: <http://127.0.0.1:8000/docs>.

## Frontend

From the repository root:

```sh
cd frontend
pnpm dev --hostname 127.0.0.1
```

Open <http://127.0.0.1:3000/>.

`frontend/.env.local` sets `NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000`.
Add your own `DEEPGRAM_API_KEY` there to enable browser speech recognition and spoken replies.
Restart the frontend after changing environment variables.

## Reinstall dependencies

```sh
python3.11 -m venv backend/venv
uv pip install --python backend/venv/bin/python -r backend/requirements.txt
cd frontend
pnpm install --frozen-lockfile
```

The workspace configuration permits build scripts for `sharp` and `unrs-resolver`.
Local environment files, dependency directories, and upload caches are ignored by Git.
No service keys are included in this document. The servers can start without them, but AI and speech requests need valid keys.

Use Ctrl+C in each server terminal to stop it.

## Save reconstruction bullets

After analysis, select **Execute Reconstruction**. Edit the suggested bullets and select the bullets to include.
Select **Save PDF copy** to replace the selected original bullets at their locations in a copy. The original file stays unchanged.
Export requires a unique text match. Shorten bullets that cannot fit their original space. Scanned PDFs need a text layer before replacement.
Replace marked metric placeholders before saving. PDF export runs locally in the backend and does not call an AI service.
