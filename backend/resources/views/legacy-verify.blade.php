<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Email Verification — VHS Animal Wellness Center</title>
    <style>
        body{margin:0;font-family:Arial,sans-serif;background:#f5f2f8;color:#2d2438;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}
        .card{max-width:560px;background:white;border-radius:18px;padding:36px;box-shadow:0 12px 40px rgba(65,43,90,.12);text-align:center}
        h1{color:#613977;margin:0 0 12px}p{line-height:1.6}.ok{font-size:48px;margin-bottom:12px}.btn{display:inline-block;margin-top:16px;background:#613977;color:white;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700}
    </style>
</head>
<body><div class="card"><div class="ok">{{ $ok ? '✓' : '!' }}</div><h1>{{ $ok ? 'Email Verified' : 'Verification Failed' }}</h1><p>{{ $message }}</p><a class="btn" href="{{ url('/web-page/index.html') }}">Back to VHS Website</a></div></body>
</html>
