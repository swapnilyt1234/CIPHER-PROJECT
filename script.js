(() => {
  
  const STORAGE_KEYS = {
    CHAIN: 'dv_chain',
    CANDIDATES: 'dv_candidates',
    WALLET: 'dv_wallet',
    VOTES: 'dv_votes'
  };

  const ADMIN_ADDRESS = '0xADMIN0000000000000000000000000000000000';

  function $(sel){ return document.querySelector(sel) }
  function $all(sel){ return Array.from(document.querySelectorAll(sel)) }

  function short(addr){ return addr ? addr.slice(0,6) + '…' + addr.slice(-4) : '—' }

  async function sha256hex(message){
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const storage = {
    get(key, fallback){
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback }
      catch(e){ return fallback }
    },
    set(key, value){ localStorage.setItem(key, JSON.stringify(value)) },
    clearAll(){ localStorage.removeItem(STORAGE_KEYS.CHAIN); localStorage.removeItem(STORAGE_KEYS.CANDIDATES); localStorage.removeItem(STORAGE_KEYS.WALLET); localStorage.removeItem(STORAGE_KEYS.VOTES) }
  };

  function initDemoData(){
    const defaultCands = [
      { id: 'c1', name: 'Chaiwala', party: 'Innovation Party', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQGrKlBcAbAJZKueIujU8OZCyoII0Rzpwx_RuLPHHKwRM9hdnW2QkcEUh38nD3oXaSZUUic9hi83dOfGEUM4G79nKIJTWUtAWrYodldDZ4&s=10' },
      { id: 'c2', name: 'Pappu', party: 'Future Now', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTCNEILCvWP3WrEAiuV252FDdwbt43ugWdahWedWkJ1y2lhOazWl4JN52WOJjkClohSoAhsJ-loEelIySiF1TsUTpPhP_ExSkpEND4xJuQ&s=10' },
      { id: 'c3', name: 'Teju bhaiya', party: 'Student Voice', img: 'https://www.livehindustan.com/lh-img/smart/img/2025/08/22/1200x900/ANI-20250805247-0_1755835534417_1755835553880.jpg' }
    ];
    if(!storage.get(STORAGE_KEYS.CANDIDATES, null)){
      storage.set(STORAGE_KEYS.CANDIDATES, defaultCands);
    }

    if(!storage.get(STORAGE_KEYS.CHAIN, null)){
      createGenesisBlock().then(chain => storage.set(STORAGE_KEYS.CHAIN, chain));
    }
    if(!storage.get(STORAGE_KEYS.VOTES, null)){
      storage.set(STORAGE_KEYS.VOTES, {});
    }
  }

  async function createGenesisBlock(){
    const genesis = {
      index: 0,
      timestamp: new Date().toISOString(),
      voter: 'GENESIS',
      candidate: null,
      previousHash: '0'.repeat(64),
      nonce: 0,
      hash: await sha256hex('GENESIS' + Date.now())
    };
    return [genesis];
  }

  async function getChain(){ return storage.get(STORAGE_KEYS.CHAIN, await createGenesisBlock()) }

  async function mineBlock(voter, candidateId, previousHash){
    const index = (await getChain()).length;
    const timestamp = new Date().toISOString();
    let nonce = 0;
    let hash = '';
    while(true){
      const content = `${index}|${timestamp}|${voter}|${candidateId}|${previousHash}|${nonce}`;
      hash = await sha256hex(content);
      if(hash.startsWith('00') || nonce > 5000) break;
      nonce++;
    }
    return { index, timestamp, voter, candidate: candidateId, previousHash, nonce, hash };
  }

  async function addVoteToChain(voter, candidateId){
    const chain = await getChain();
    const previousHash = chain[chain.length - 1].hash;
    const block = await mineBlock(voter, candidateId, previousHash);
    chain.push(block);
    storage.set(STORAGE_KEYS.CHAIN, chain);
    return block;
  }

  async function verifyChain(){
    const chain = await getChain();
    for(let i=1;i<chain.length;i++){
      const prev = chain[i-1];
      const cur = chain[i];
      if(cur.previousHash !== prev.hash) return { ok:false, index:i, reason:'previousHash mismatch' };
      const content = `${cur.index}|${cur.timestamp}|${cur.voter}|${cur.candidate}|${cur.previousHash}|${cur.nonce}`;
      const expected = await sha256hex(content);
      if(expected !== cur.hash) return { ok:false, index:i, reason:'hash mismatch' };
    }
    return { ok:true };
  }

  async function connectMetaMask(){
    if(typeof window.ethereum === 'undefined'){
      throw new Error('MetaMask is not installed. Please install MetaMask extension.');
    }
    
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      if(!accounts || accounts.length === 0){
        throw new Error('No accounts found. Please unlock MetaMask.');
      }
      
      const address = accounts[0];
      
      const balanceWei = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });
      
      const balanceEth = parseInt(balanceWei, 16) / 1e18;
      
      const wallet = { 
        address: address, 
        balance: parseFloat(balanceEth.toFixed(4)),
        isMetaMask: true 
      };
      
      storage.set(STORAGE_KEYS.WALLET, wallet);
      
      window.ethereum.on('accountsChanged', (accounts) => {
        if(accounts.length === 0){
          storage.set(STORAGE_KEYS.WALLET, null);
          location.reload();
        } else {
          connectMetaMask().then(() => location.reload());
        }
      });
      
      window.ethereum.on('chainChanged', () => {
        location.reload();
      });
      
      return wallet;
    } catch(error) {
      if(error.code === 4001){
        throw new Error('Please connect to MetaMask.');
      }
      throw error;
    }
  }

  function getWallet(){ return storage.get(STORAGE_KEYS.WALLET, null) }

  function hasVoted(address){
    const votes = storage.get(STORAGE_KEYS.VOTES, {});
    return !!votes[address];
  }

  function markVoted(address, candidateId){
    const votes = storage.get(STORAGE_KEYS.VOTES, {});
    votes[address] = { candidateId, timestamp: new Date().toISOString() };
    storage.set(STORAGE_KEYS.VOTES, votes);
  }

  function spendGas(address, amount=1){
    const wallet = getWallet();
    if(!wallet || wallet.address.toLowerCase() !== address.toLowerCase()) return false;
    if(wallet.isMetaMask) return true;
    if(wallet.balance < amount) return false;
    wallet.balance -= amount;
    storage.set(STORAGE_KEYS.WALLET, wallet);
    return true;
  }

  const UI = {
    init(){
      this.connectBtn = $('#connectBtn');
      this.walletDisplay = $('#walletDisplay');
      this.candidatesList = $('#candidatesList');
      this.dashboard = $('#dashboard');
      this.explorer = $('#explorer');
      this.verifyBtn = $('#verifyBtn');
      this.exportBtn = $('#exportBtn');
      this.clearBtn = $('#clearBtn');
      this.message = $('#message');
      this.addrShort = $('#addrShort');
      this.balanceEl = $('#balance');
      this.votedStatus = $('#votedStatus');
      this.adminPanel = $('#adminPanel');
      this.addCandidateBtn = $('#addCandidateBtn');
      this.newCandName = $('#newCandName');
      this.newCandParty = $('#newCandParty');
      this.newCandImg = $('#newCandImg');

      this.bind();
      this.renderAll();
    },

    bind(){
      this.connectBtn.addEventListener('click', async () => {
        if(!getWallet()){
          try {
            this.connectBtn.disabled = true;
            this.connectBtn.innerHTML = 'Connecting<span class="spinner"></span>';
            
            const w = await connectMetaMask();
            
            this.showMessage(`MetaMask connected: ${short(w.address)} 🎉`, false, 'success');
            this.connectBtn.innerHTML = 'Connect Wallet';
            this.connectBtn.disabled = false;
          } catch(error) {
            this.showMessage(`Failed to connect: ${error.message}`, true, 'error');
            this.connectBtn.innerHTML = 'Connect Wallet';
            this.connectBtn.disabled = false;
            return;
          }
        } else {
          this.showMessage('Wallet already connected for this session', false);
        }
        this.renderAll();
      });

      this.verifyBtn.addEventListener('click', async () => {
        this.verifyBtn.disabled = true;
        this.verifyBtn.innerHTML = 'Verifying<span class="spinner"></span>';
        this.showMessage('Verifying blockchain integrity...', false);
        const res = await verifyChain();
        if(res.ok) this.showMessage('Chain verified ✅ All blocks are valid', false, 'success')
        else this.showMessage(`⚠️ Chain compromised at block ${res.index}: ${res.reason}`, true, 'error');
        this.verifyBtn.disabled = false;
        this.verifyBtn.innerHTML = 'Verify Blockchain Integrity';
      });

      this.exportBtn.addEventListener('click', () => {
        const chain = storage.get(STORAGE_KEYS.CHAIN, []);
        const blob = new Blob([JSON.stringify(chain, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'decentra_vote_chain.json';
        a.click();
        URL.revokeObjectURL(url);
        this.showMessage('Blockchain exported successfully 📥', false, 'success');
      });

      this.clearBtn.addEventListener('click', () => {
        if(confirm('Reset demo data? This clears chain, votes, candidates and wallet.')) {
          storage.clearAll();
          initDemoData();
          this.showMessage('Demo reset. Reloading UI...', false, 'success');
          setTimeout(()=>this.renderAll(),300);
        }
      });

      this.addCandidateBtn.addEventListener('click', () => {
        const name = this.newCandName.value.trim();
        const party = this.newCandParty.value.trim() || 'Independent';
        const img = this.newCandImg.value.trim();
        if(!name){ 
          this.showMessage('Candidate name is required', true, 'error');
          return; 
        }
        const cands = storage.get(STORAGE_KEYS.CANDIDATES, []);
        const id = 'c' + (Date.now().toString(36));
        cands.push({ id, name, party, img });
        storage.set(STORAGE_KEYS.CANDIDATES, cands);
        this.newCandName.value = this.newCandParty.value = this.newCandImg.value = '';
        this.showMessage(`Candidate "${name}" added successfully ✅`, false, 'success');
        this.renderAll();
      });
    },

    showMessage(txt, isError, type){
      this.message.textContent = txt;
      this.message.className = 'message';
      if(isError || type === 'error'){
        this.message.classList.add('error');
      } else if(type === 'success'){
        this.message.classList.add('success');
      }
      setTimeout(()=>{ 
        this.message.textContent='';
        this.message.className = 'message';
      }, 4000);
    },

    async renderCandidates(){
      const cands = storage.get(STORAGE_KEYS.CANDIDATES, []);
      const wallet = getWallet();
      const votes = storage.get(STORAGE_KEYS.VOTES, {});
      this.candidatesList.innerHTML = '';
      for(const c of cands){
        const div = document.createElement('div');
        div.className = 'candidate';
        
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'candidate-img-wrapper';
        
        const img = document.createElement('img');
        img.className = 'loading';
        img.alt = c.name;
        
        const fallbackImages = [
          c.img,
          `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&size=128&background=6ee7b7&color=0b1020&bold=true`,
          `https://source.unsplash.com/collection/895539/128x128?sig=${c.id}`,
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.name)}&backgroundColor=6ee7b7`
        ].filter(Boolean);
        
        let currentIndex = 0;
        const tryLoadImage = () => {
          if (currentIndex >= fallbackImages.length) {
            img.className = 'error';
            const placeholder = document.createElement('div');
            placeholder.className = 'img-placeholder';
            placeholder.style.width = '64px';
            placeholder.style.height = '64px';
            placeholder.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;font-weight:700;color:var(--accent)">${c.name.charAt(0).toUpperCase()}</div>`;
            imgWrapper.appendChild(placeholder);
            return;
          }
          
          const testImg = new Image();
          testImg.onload = () => {
            img.src = fallbackImages[currentIndex];
            img.className = '';
            setTimeout(() => img.style.opacity = '1', 50);
          };
          testImg.onerror = () => {
            currentIndex++;
            tryLoadImage();
          };
          setTimeout(() => {
            if (img.className === 'loading') {
              currentIndex++;
              tryLoadImage();
            }
          }, 3000);
          testImg.src = fallbackImages[currentIndex];
        };
        
        tryLoadImage();
        imgWrapper.appendChild(img);
        
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.innerHTML = `
          <div class="name">${c.name}</div>
          <div class="party">${c.party}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px">ID: <code style="font-family:monospace">${c.id}</code></div>
        `;
        
        const voteActions = document.createElement('div');
        voteActions.className = 'vote-actions';
        const voteBtn = document.createElement('button');
        voteBtn.className = 'btn voteBtn';
        voteBtn.dataset.id = c.id;
        voteBtn.textContent = 'Vote';
        voteActions.appendChild(voteBtn);
        
        div.appendChild(imgWrapper);
        div.appendChild(meta);
        div.appendChild(voteActions);
        this.candidatesList.appendChild(div);
      }

      $all('.voteBtn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = btn.dataset.id;
          const wallet = getWallet();
          if(!wallet){ this.showMessage('Please connect wallet first', true); return; }
          if(hasVoted(wallet.address)){ this.showMessage('This wallet already voted', true); return; }
          if(!spendGas(wallet.address, 1)){ this.showMessage('Insufficient demo balance for gas', true); return; }
          
          btn.disabled = true;
          btn.innerHTML = 'Mining<span class="spinner"></span>';
          
          this.showMessage('Mining transaction...', false);
          const block = await addVoteToChain(wallet.address, id);
          markVoted(wallet.address, id);
          this.showMessage(`Vote added in block #${block.index} ✅`, false, 'success');
          this.renderAll();
        });
      });
    },

    renderDashboard(){
      const chain = storage.get(STORAGE_KEYS.CHAIN, []);
      const cands = storage.get(STORAGE_KEYS.CANDIDATES, []);
      const counts = {};
      for(const c of cands) counts[c.id] = 0;
      for(const b of chain.slice(1)){
        if(b.candidate && counts[b.candidate] !== undefined) counts[b.candidate]++;
      }
      this.dashboard.innerHTML = '';
      const totalVotes = Object.values(counts).reduce((s,n)=>s+n,0);
      const barWrap = document.createElement('div');
      barWrap.className = 'bar';
      for(const c of cands){
        const col = document.createElement('div');
        col.className = 'col';
        const voteCount = counts[c.id] || 0;
        const pct = totalVotes ? Math.round((voteCount/totalVotes)*100) : 0;
        col.style.height = `${Math.max(20, pct*1.2 + 10)}px`;
        col.title = `${c.name}: ${voteCount} votes (${pct}%)`;
        col.innerHTML = `<div style="font-size:12px;padding:4px 6px">${voteCount}</div>`;
        barWrap.appendChild(col);
      }
      this.dashboard.appendChild(barWrap);
      const info = document.createElement('div');
      info.style.marginTop='8px';
      info.style.color='var(--muted)';
      info.textContent = `Total votes: ${totalVotes}`;
      this.dashboard.appendChild(info);
    },

    renderExplorer(){
      const chain = storage.get(STORAGE_KEYS.CHAIN, []);
      this.explorer.innerHTML = '';
      for(let i=chain.length-1;i>=0;i--){
        const b = chain[i];
        const div = document.createElement('div');
        div.className = 'block';
        div.innerHTML = `<div><strong>Block #${b.index}</strong> • ${new Date(b.timestamp).toLocaleString()}</div>
          <div class="meta">
            <div>voter: <code>${short(b.voter)}</code></div>
            <div>candidate: <code>${b.candidate || '—'}</code></div>
            <div>nonce: <code>${b.nonce}</code></div>
            <div>hash: <code>${b.hash.slice(0,24)}…</code></div>
          </div>`;
        this.explorer.appendChild(div);
      }
    },

    renderWalletInfo(){
      const wallet = getWallet();
      if(wallet){
        $('#walletDisplay').classList.remove('hidden');
        $('#walletDisplay').textContent = short(wallet.address);
        this.addrShort.textContent = wallet.address;
        this.balanceEl.textContent = wallet.isMetaMask ? `${wallet.balance} ETH` : wallet.balance;
        this.votedStatus.textContent = hasVoted(wallet.address) ? 'Yes' : 'No';
        if(wallet.address.toLowerCase() === ADMIN_ADDRESS.toLowerCase()){
          this.adminPanel.classList.remove('hidden');
        } else {
          this.adminPanel.classList.add('hidden');
        }
      } else {
        $('#walletDisplay').classList.add('hidden');
        this.addrShort.textContent = '—';
        this.balanceEl.textContent = '0';
        this.votedStatus.textContent = 'No';
        this.adminPanel.classList.add('hidden');
      }
    },

    renderAll: async function(){
      await initDemoData();
      await this.renderCandidates();
      this.renderDashboard();
      this.renderExplorer();
      this.renderWalletInfo();
    }
  };

  (async function start(){
    initDemoData();
    UI.init();
    const existingWallet = getWallet();
    if(!existingWallet){
      UI.showMessage('Click Connect Wallet to connect your MetaMask', false);
    } else if(existingWallet.isMetaMask) {
      try {
        await connectMetaMask();
        UI.renderAll();
      } catch(error) {
        storage.set(STORAGE_KEYS.WALLET, null);
        UI.showMessage('Click Connect Wallet to connect your MetaMask', false);
        UI.renderAll();
      }
    }
  })();

})();
