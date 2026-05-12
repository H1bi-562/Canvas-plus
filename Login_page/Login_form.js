fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})
.then(res => res.json())
.then(data => {
  if (data.error) { /* show inline error */ return; }
  showSuccess("You're in!", `Welcome back, ${email.split('@')[0]}.`);
})
.catch(() => { /* handle network failure */ })
.finally(() => setLoading('loginBtn', 'loginSpinner', 'loginBtnText', false, 'Sign in'));
