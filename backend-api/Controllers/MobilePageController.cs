using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers;

public class MobilePageController : Controller
{
    [HttpGet("mobile-upload/{token}")]
    public IActionResult MobileUpload(string token)
    {
        var html = $$"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Upload Video</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
            background: #f5f5f7;
            color: #1d1d1f;
            min-height: 100vh;
            min-height: 100dvh;
        }
        .header {
            display: flex; align-items: center; gap: 8px;
            padding: 16px 20px;
            font-size: 17px; font-weight: 600;
            background: rgba(255,255,255,0.72);
            backdrop-filter: saturate(180%) blur(20px);
            -webkit-backdrop-filter: saturate(180%) blur(20px);
            border-bottom: 1px solid #d2d2d7;
        }
        .header svg { color: #007aff; }
        .content { padding: 32px 20px; }
        h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.04em; margin-bottom: 8px; }
        .subtitle { font-size: 15px; color: #86868b; margin-bottom: 32px; }
        .upload-btn {
            display: flex; align-items: center; justify-content: center; gap: 10px;
            width: 100%; padding: 18px;
            background: #007aff; color: white; border: none; border-radius: 14px;
            font-size: 17px; font-weight: 600; cursor: pointer;
        }
        .upload-btn:active { background: #0056b3; }
        .upload-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .card {
            background: white; border-radius: 14px; padding: 20px;
            border: 1px solid #e5e5ea; margin-top: 20px;
        }
        .file-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; word-break: break-all; }
        .file-size { font-size: 13px; color: #86868b; margin-bottom: 16px; }
        .progress-bg { height: 8px; background: #e5e5ea; border-radius: 4px; overflow: hidden; }
        .progress-bar {
            height: 100%; background: #007aff; border-radius: 4px;
            transition: width 0.3s ease; width: 0%;
        }
        .progress-bar.complete { background: #34c759; }
        .progress-bar.error { background: #ff3b30; }
        .progress-text { margin-top: 8px; font-size: 13px; color: #86868b; }
        .done { text-align: center; margin-top: 24px; }
        .done .check { color: #34c759; margin-bottom: 8px; }
        .done p { font-size: 15px; color: #86868b; margin-bottom: 16px; }
        .another-btn {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 12px 24px; background: #f5f5f7; color: #007aff;
            border: none; border-radius: 980px; font-size: 15px; font-weight: 600; cursor: pointer;
        }
        .success-banner {
            display: flex; align-items: center; gap: 8px;
            padding: 12px 16px; background: rgba(52,199,89,0.1); color: #248a3d;
            border-radius: 10px; font-size: 14px; font-weight: 500; margin-bottom: 24px;
        }
        .center {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            min-height: 100vh; min-height: 100dvh; padding: 24px; text-align: center;
        }
        .center h2 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
        .center p { font-size: 15px; color: #86868b; max-width: 280px; }
        .error-icon {
            width: 64px; height: 64px; border-radius: 18px;
            background: rgba(255,59,48,0.1); color: #ff3b30;
            display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
        }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div id="loading" class="center">
        <svg class="spinner" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <p style="margin-top:12px">Verifying link...</p>
    </div>

    <div id="expired" class="center hidden">
        <div class="error-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h2>Link Expired</h2>
        <p>This upload link is no longer valid. Please scan a new QR code on your computer.</p>
    </div>

    <div id="app" class="hidden">
        <div class="header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 6 4-6 4Z"/></svg>
            <span>Video Platform</span>
        </div>
        <div class="content">
            <h1>Upload from Phone</h1>
            <p class="subtitle">Choose a video to upload directly from your phone</p>

            <div id="success-banner" class="success-banner hidden">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span id="success-text"></span>
            </div>

            <button id="choose-btn" class="upload-btn" onclick="document.getElementById('file-input').click()">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Choose Video
            </button>
            <input id="file-input" type="file" accept="video/*" style="display:none" onchange="handleFile(this)" />

            <div id="upload-card" class="card hidden">
                <div id="upload-file-name" class="file-name"></div>
                <div id="upload-file-size" class="file-size"></div>
                <div class="progress-bg">
                    <div id="progress-bar" class="progress-bar"></div>
                </div>
                <div id="progress-text" class="progress-text"></div>
                <div id="done-section" class="done hidden">
                    <div class="check">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <p>Video sent to your computer</p>
                    <button class="another-btn" onclick="resetUpload()">Upload Another</button>
                </div>
                <div id="error-section" class="hidden" style="text-align:center;margin-top:12px">
                    <button class="another-btn" onclick="resetUpload()">Try Again</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const TOKEN = '{{token}}';
        const API = '/api';
        let MAX_FILE_SIZE = 5 * 1024 * 1024;
        let MAX_DURATION_SECONDS = 60;
        let uploadCount = 0;

        // Fetch dynamic limits
        fetch(API + '/settings/upload-limits')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data) {
                    MAX_FILE_SIZE = data.maxFileSizeBytes;
                    MAX_DURATION_SECONDS = data.maxDurationSeconds;
                }
            })
            .catch(() => {});

        function formatSize(bytes) {
            if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
            if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
            return (bytes / 1e3).toFixed(1) + ' KB';
        }

        function show(id) { document.getElementById(id).classList.remove('hidden'); }
        function hide(id) { document.getElementById(id).classList.add('hidden'); }

        // Validate token
        fetch(API + '/mobile-upload/token/' + TOKEN + '/validate')
            .then(r => {
                hide('loading');
                if (r.ok) show('app');
                else show('expired');
            })
            .catch(() => { hide('loading'); show('expired'); });

        function getVideoDuration(file) {
            return new Promise(resolve => {
                const v = document.createElement('video');
                v.preload = 'metadata';
                v.onloadedmetadata = () => {
                    URL.revokeObjectURL(v.src);
                    const t = Math.floor(v.duration);
                    resolve(Math.floor(t/60) + ':' + String(t%60).padStart(2,'0'));
                };
                v.onerror = () => resolve('0:00');
                v.src = URL.createObjectURL(file);
            });
        }

        async function handleFile(input) {
            const file = input.files[0];
            if (!file || !file.type.startsWith('video/')) return;
            input.value = '';

            if (file.size > MAX_FILE_SIZE) {
                alert('File size exceeds the ' + (MAX_FILE_SIZE / (1024 * 1024)) + ' MB limit.');
                return;
            }

            hide('choose-btn');
            hide('success-banner');
            show('upload-card');
            hide('done-section');
            hide('error-section');

            document.getElementById('upload-file-name').textContent = file.name;
            document.getElementById('upload-file-size').textContent = formatSize(file.size);

            const bar = document.getElementById('progress-bar');
            const text = document.getElementById('progress-text');
            bar.style.width = '0%';
            bar.className = 'progress-bar';
            text.textContent = 'Checking video duration...';

            try {
                const duration = await getVideoDuration(file);
                const parts = duration.split(':');
                const totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                if (totalSeconds > MAX_DURATION_SECONDS) {
                    bar.classList.add('error');
                    text.textContent = 'Video duration exceeds the ' + MAX_DURATION_SECONDS + ' second limit.';
                    show('error-section');
                    return;
                }

                const res = await fetch(API + '/mobile-upload/token/' + TOKEN + '/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: file.name, size: file.size, duration })
                });

                if (!res.ok) {
                    let msg = 'Upload rejected by server';
                    try { const j = await res.json(); if (j.message) msg = j.message; } catch(e) {}
                    throw new Error(msg);
                }
                const { uploadUrl } = await res.json();

                const xhr = new XMLHttpRequest();
                xhr.open('PUT', uploadUrl);

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        bar.style.width = pct + '%';
                        text.textContent = 'Uploading... ' + pct + '%';
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        bar.style.width = '100%';
                        bar.classList.add('complete');
                        text.textContent = 'Upload complete!';
                        show('done-section');
                        uploadCount++;
                    } else {
                        bar.classList.add('error');
                        text.textContent = 'Upload failed (' + xhr.status + ')';
                        show('error-section');
                    }
                };

                xhr.onerror = () => {
                    bar.classList.add('error');
                    text.textContent = 'Network error';
                    show('error-section');
                };

                xhr.send(file);
            } catch (err) {
                bar.classList.add('error');
                text.textContent = err.message || 'Upload failed';
                show('error-section');
            }
        }

        function resetUpload() {
            hide('upload-card');
            show('choose-btn');
            if (uploadCount > 0) {
                document.getElementById('success-text').textContent =
                    uploadCount + ' video' + (uploadCount > 1 ? 's' : '') + ' uploaded successfully';
                show('success-banner');
            }
        }
    </script>
</body>
</html>
""";

        return Content(html, "text/html");
    }
}
