(function(){
  // active nav
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(a=>{
    const href = a.getAttribute('href');
    if (href === path || (path==='index.html' && (href==='/'||href==='index.html'))) a.classList.add('active');
  });
  // year
  const y = document.getElementById('y'); if(y) y.textContent = new Date().getFullYear();
  // back buttons
  document.querySelectorAll('[data-back]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.preventDefault();
      if (document.referrer && document.referrer !== location.href) history.back();
      else location.href = 'index.html';
    });
  });
  // card hover cursor light
  document.addEventListener('pointermove', (e)=>{
    document.querySelectorAll('.card').forEach(card=>{
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      card.style.setProperty('--mx', x + '%');
    });
  });
  // reveal on scroll
  const io = new IntersectionObserver((entries)=>{
    for (const ent of entries){
      if (ent.isIntersecting){ ent.target.classList.add('show'); io.unobserve(ent.target); }
    }
  },{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
})();
