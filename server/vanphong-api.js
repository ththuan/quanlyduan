/* ============================================================
   Van Phong AI - API endpoints
   Simple API stubs for van-phong-ai HTML to work
   ============================================================ */

module.exports = function(app, db, requireAuth, requireAuthWeb) {

// ---- AI Config API ----
app.get('/api/ai/config', requireAuthWeb, (req, res) => {
  res.json({
    enabled: false,
    provider: 'none',
    model: '',
    temperature: 0.7,
    message: 'AI features disabled in basic mode'
  });
});

app.put('/api/ai/config', requireAuth, (req, res) => {
  res.json({ success: false, message: 'AI config is read-only' });
});

// ---- AI Test & Respond ----
app.post('/api/ai/test', requireAuth, (req, res) => {
  res.json({ success: false, message: 'AI not configured' });
});

app.post('/api/ai/respond', requireAuthWeb, (req, res) => {
  res.json({ 
    success: false,
    response: 'AI agent chưa được kích hoạt. Vui lòng cấu hình AI API key.',
    confidence: 0
  });
});

// ---- Dossiers (Cases) API ----
app.get('/api/dossiers', requireAuthWeb, (req, res) => {
  // Return empty dossiers for now
  res.json({ dossiers: [] });
});

app.post('/api/dossiers', requireAuthWeb, (req, res) => {
  res.json({ 
    success: false,
    message: 'Dossier creation disabled in basic mode'
  });
});

app.get('/api/dossiers/:id', requireAuthWeb, (req, res) => {
  res.status(404).json({ error: 'Dossier not found' });
});

app.delete('/api/dossiers/:id', requireAuth, (req, res) => {
  res.json({ success: false, message: 'Operation not supported' });
});

app.post('/api/dossiers/:id/open', requireAuthWeb, (req, res) => {
  res.json({ success: false, message: 'Operation not supported' });
});

app.post('/api/dossiers/:id/interaction', requireAuthWeb, (req, res) => {
  res.json({ success: false, message: 'Operation not supported' });
});

app.post('/api/dossiers/report', requireAuthWeb, (req, res) => {
  res.json({ 
    report: 'Chức năng báo cáo chưa khả dụng',
    timestamp: new Date().toISOString()
  });
});

// ---- Knowledge Base API ----
app.get('/api/knowledge/status', requireAuthWeb, (req, res) => {
  res.json({ 
    enabled: false,
    documents: 0,
    lastSync: null,
    message: 'Knowledge base not configured'
  });
});

app.get('/api/knowledge/chat', requireAuthWeb, (req, res) => {
  res.json({ messages: [] });
});

app.delete('/api/knowledge/chat', requireAuthWeb, (req, res) => {
  res.json({ success: true });
});

app.get('/api/knowledge/documents', requireAuthWeb, (req, res) => {
  res.json({ documents: [] });
});

app.post('/api/knowledge/sync', requireAuth, (req, res) => {
  res.json({ success: false, message: 'Knowledge sync not configured' });
});

app.post('/api/knowledge/ask', requireAuthWeb, (req, res) => {
  res.json({ 
    answer: 'Knowledge base chưa được cấu hình',
    sources: [],
    confidence: 0
  });
});

app.post('/api/knowledge/documents/:id/open', requireAuthWeb, (req, res) => {
  res.json({ success: false, message: 'Document not found' });
});

app.delete('/api/knowledge/documents/:id/delete', requireAuth, (req, res) => {
  res.json({ success: false, message: 'Operation not supported' });
});

// ---- Memory API ----
app.post('/api/memory', requireAuthWeb, (req, res) => {
  res.json({ success: false, message: 'Memory system disabled' });
});

app.post('/api/memory/consolidate', requireAuth, (req, res) => {
  res.json({ success: false, message: 'Memory consolidation not available' });
});

app.delete('/api/memory/:id', requireAuth, (req, res) => {
  res.json({ success: true });
});

// ---- Reminders API ----
app.get('/api/reminders', requireAuthWeb, (req, res) => {
  res.json({ reminders: [] });
});

app.post('/api/reminders', requireAuthWeb, (req, res) => {
  res.json({ success: false, message: 'Reminder system disabled' });
});

// ---- QLDA Monitor API (for van-phong-ai integration) ----
app.get('/api/qlda/monitor', requireAuthWeb, (req, res) => {
  // Return simplified project data
  const state = db.getState();
  const projects = (state.projects || []).map(p => ({
    id: p.id,
    name: p.name,
    fullName: p.fullName,
    status: 'active',
    packages: []
  }));
  
  res.json({ 
    projects,
    timestamp: new Date().toISOString()
  });
});

// ---- Office Life API (for office simulator) ----
app.get('/api/office-life', requireAuthWeb, (req, res) => {
  res.json({
    state: null,
    events: [],
    memories: [],
    hooks: [],
    updatedAt: new Date().toISOString()
  });
});

app.post('/api/office-life/sync', requireAuthWeb, (req, res) => {
  res.json({ success: true });
});

app.post('/api/office-life/dialogue', requireAuthWeb, (req, res) => {
  res.json({ 
    scene: null,
    message: 'AI dialogue generation not configured'
  });
});

};
