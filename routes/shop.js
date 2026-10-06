'use strict';
// 온라인몰 — 상품 상세·장바구니·주문서·회원·마이페이지·고객센터
const express = require('express');
const { db, getSetting } = require('../db');
const { page } = require('../lib/layout');
const settings = require('../lib/settings');
const quotes = require('../lib/quotes');
const cart = require('../lib/cart');
const member = require('../lib/member');
const { productCard } = require('../lib/cards');
const { CAT_LABEL } = require('../lib/content/templates');
const { esc, attr, fmtNum, now, isoFromTs, fmtKoDate, kstDate } = require('../lib/util');

const router = express.Router();
const ctx = (req, res) => ({ me: member.current(req), cartCount: cart.count(req, res) });
const need = (req, res, next) => (member.current(req) ? next() : res.redirect('/login?next=' + encodeURIComponent(req.originalUrl)));
const money = (n) => fmtNum(n) + '원';
const dateOf = (ts) => fmtKoDate(kstDate(new Date((ts || 0) * 1000)));
const STATUS = { pending: '입금 대기', paid: '결제 완료', ready: '상품 준비', shipping: '배송 중', done: '배송 완료', cancel: '취소', refund: '환불' };

// ── 상품 상세 (온라인몰형) ──
router.get('/products/:slug', (req, res, next) => {
  const p = db.prepare("SELECT * FROM products WHERE slug=? AND status='published'").get(req.params.slug);
  if (!p) return next();
  const s = settings.all(); const c = ctx(req, res);
  const opts = cart.options(p.id);
  const base = cart.priceWith(p, []);
  const reviews = db.prepare('SELECT * FROM reviews WHERE visible=1 AND product_id=? ORDER BY id DESC LIMIT 20').all(p.id);
  const rel = db.prepare("SELECT * FROM products WHERE status='published' AND category=? AND id<>? ORDER BY sort, id LIMIT 4").all(p.category, p.id);
  const ship = p.shipping_fee == null ? cart.shippingFeeDefault() : p.shipping_fee;
  const detail = (() => { try { return JSON.parse(p.detail_images || '[]'); } catch (_) { return []; } })();
  const liked = c.me ? !!db.prepare('SELECT 1 FROM wishlists WHERE member_id=? AND product_id=?').get(c.me.id, p.id) : false;
  const optionBlock = Object.entries(opts).map(([kind, rows]) => `
    <label class="po-row"><span>${esc({ karat: '순도', size: '호수', design: '디자인', stone: '스톤', color: '색상' }[kind] || kind)}</span>
      <select data-opt="${attr(kind)}">${rows.map((o, i) => `<option value="${o.id}"${i === 0 ? ' selected' : ''}>${esc(o.label)}${o.add_price ? ` (+${fmtNum(o.add_price)}원)` : ''}</option>`).join('')}</select></label>`).join('');

  const body = `
<section class="pd-wrap"><div class="wrap pd-grid" id="pdetail" data-id="${p.id}">
  <div class="pd-gallery">
    <div class="pd-main">${p.image ? `<img src="${attr(p.image)}" alt="${attr(p.name)}">` : `<span class="pc-glyph">${p.metal === 'silver' ? 'Ag' : 'Au'}</span>`}</div>
  </div>
  <div class="pd-info">
    <p class="pd-cat">${esc(CAT_LABEL[p.category] || '상품')}</p>
    <h1>${esc(p.name)}</h1>
    ${p.badge || p.ready_today ? `<p class="pd-badges">${p.ready_today ? '<span class="badge badge-today">오늘 출발</span>' : ''}${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}</p>` : ''}
    <p class="pd-price"><b id="pdPrice">${base.price ? money(base.price) : '시세 문의'}</b></p>
    <p class="pd-ship">배송비 ${ship ? money(ship) + ` (${money(cart.freeShipOver())} 이상 무료)` : '무료'} · 매장 수령 가능</p>
    <div class="pd-opts">${optionBlock}
      <label class="po-row"><span>수량</span><input type="number" id="pdQty" min="1" max="99" value="1"></label>
    </div>
    <p class="pd-total">총 상품금액 <b id="pdTotal">${base.price ? money(base.price) : '-'}</b></p>
    <div class="pd-actions">
      <button type="button" class="pd-like${liked ? ' on' : ''}" id="pdLike" aria-label="찜하기">♥</button>
      <button type="button" class="btn btn-ghost lg" id="pdCart">장바구니</button>
      <button type="button" class="btn btn-gold lg" id="pdBuy">구매하기</button>
    </div>
    <p class="form-msg" id="pdMsg" aria-live="polite"></p>
  </div>
</div></section>

<section class="section pd-review"><div class="wrap">
  <h2>고객 리뷰 <small>${reviews.length}건</small></h2>
  ${reviews.length ? `<ul class="rv-list">${reviews.map((r) => `<li><span class="stars">${'★'.repeat(r.rating)}</span><b>${esc(r.name)}</b><time>${dateOf(r.created_at)}</time><p>${esc(r.text)}</p>${(() => { try { return (JSON.parse(r.photos || '[]') || []).map((u) => `<img src="${attr(u)}" alt="" loading="lazy">`).join(''); } catch (_) { return ''; } })()}</li>`).join('')}</ul>`
    : '<p class="note">아직 등록된 리뷰가 없습니다. 구매하신 회원만 리뷰를 작성하실 수 있습니다.</p>'}
</div></section>

<section class="section pd-detail"><div class="wrap narrow">
  ${detail.map((u) => `<img src="${attr(u)}" alt="${attr(p.name)} 상세 이미지" loading="lazy">`).join('')}
  ${p.body_html || ''}
</div></section>

${rel.length ? `<section class="section"><div class="wrap"><div class="sec-head"><div><h2>함께 보면 좋은 상품</h2></div></div><div class="pgrid">${rel.map(productCard).join('')}</div></div></section>` : ''}`;

  res.send(page({
    title: `${p.name} ${base.price ? money(base.price) : ''} | 문강금은 온라인몰`,
    description: `${p.name} — ${p.purity} ${p.weight_g}g. ${base.price ? money(base.price) + ' (부가세 포함)' : '당일 시세 연동'}. 종로3가 문강금은 공식 온라인몰.`,
    path: `/products/${p.slug}`, body, bodyClass: 'shop pdetail-page', ...c,
    breadcrumbs: [{ name: '상품', href: '/products' }, { name: p.name, href: `/products/${p.slug}` }],
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.slug, image: p.image ? settings.siteUrl() + p.image : undefined,
      description: p.summary || p.name, brand: { '@type': 'Brand', name: '문강금은' },
      offers: base.price ? { '@type': 'Offer', price: base.price, priceCurrency: 'KRW', availability: 'https://schema.org/InStock', url: `${settings.siteUrl()}/products/${p.slug}` } : undefined,
      aggregateRating: reviews.length ? { '@type': 'AggregateRating', ratingValue: Math.round(reviews.reduce((a, r) => a + r.rating, 0) / reviews.length * 10) / 10, reviewCount: reviews.length } : undefined,
    }],
  }));
});

// ── 장바구니 ──
router.get('/cart', (req, res) => {
  const items = cart.list(req, res); const c = ctx(req, res);
  const t = cart.totals(items, {});
  const body = `
<section class="page-head"><div class="wrap"><h1>장바구니</h1></div></section>
<section class="section"><div class="wrap cart-grid">
  <div class="cart-list">
    ${items.length ? items.map((r) => `<div class="cart-row" data-id="${r.id}">
      <a class="cr-img" href="/products/${attr(r.product.slug)}">${r.product.image ? `<img src="${attr(r.product.image)}" alt="">` : '<span class="pc-glyph">Au</span>'}</a>
      <div class="cr-info"><a href="/products/${attr(r.product.slug)}"><b>${esc(r.product.name)}</b></a>${r.option_text ? `<span>${esc(r.option_text)}</span>` : ''}<span class="cr-unit">${money(r.unit_price)}</span></div>
      <div class="cr-qty"><button type="button" data-qty="-1">−</button><input type="number" value="${r.qty}" min="1" max="99"><button type="button" data-qty="1">+</button></div>
      <div class="cr-sum">${money(r.line_total)}</div>
      <button type="button" class="cr-del" aria-label="삭제">×</button>
    </div>`).join('') : '<p class="note">장바구니가 비어 있습니다. <a href="/products">상품 보러 가기 →</a></p>'}
  </div>
  <aside class="cart-sum">
    <h2>결제 예정 금액</h2>
    <dl><dt>상품 금액</dt><dd>${money(t.itemsTotal)}</dd><dt>배송비</dt><dd>${t.shipping ? money(t.shipping) : '무료'}</dd></dl>
    <p class="cs-total">합계 <b>${money(t.itemsTotal + t.shipping)}</b></p>
    <a class="btn btn-gold block lg${items.length ? '' : ' disabled'}" href="${items.length ? '/checkout' : '#'}">주문하기</a>
    <p class="note">${money(cart.freeShipOver())} 이상 구매 시 배송비가 무료입니다.</p>
  </aside>
</div></section>`;
  res.send(page({ title: '장바구니', description: '문강금은 온라인몰 장바구니', path: '/cart', body, bodyClass: 'shop', noindex: true, ...c }));
});

// ── 주문서 ──
router.get('/checkout', (req, res) => {
  const items = cart.list(req, res); const c = ctx(req, res);
  if (!items.length) return res.redirect('/cart');
  const t = cart.totals(items, {});
  const m = c.me;
  const body = `
<section class="page-head"><div class="wrap"><h1>주문서 작성</h1></div></section>
<section class="section"><div class="wrap cart-grid">
  <form class="checkout-form" id="checkoutForm">
    <h2>주문 상품</h2>
    <ul class="co-items">${items.map((r) => `<li><b>${esc(r.product.name)}</b>${r.option_text ? ` <small>${esc(r.option_text)}</small>` : ''} <span>${r.qty}개</span><em>${money(r.line_total)}</em></li>`).join('')}</ul>
    <h2>주문자</h2>
    <div class="row"><label>이름 <input name="buyer_name" required maxlength="40" value="${attr(m ? m.name : '')}"></label><label>연락처 <input name="buyer_phone" required maxlength="20" inputmode="tel" value="${attr(m ? m.phone || '' : '')}" placeholder="010-0000-0000"></label></div>
    <label>이메일 <input name="buyer_email" type="email" maxlength="80" value="${attr(m ? m.email : '')}"></label>
    <h2>수령 방법</h2>
    <div class="radio-row"><label><input type="radio" name="receive_method" value="delivery" checked> 택배 배송</label><label><input type="radio" name="receive_method" value="pickup"> 매장 수령(종로3가)</label></div>
    <div id="addrBox">
      <div class="row"><label>받는 분 <input name="receiver_name" maxlength="40" value="${attr(m ? m.name : '')}"></label><label>연락처 <input name="receiver_phone" maxlength="20" inputmode="tel" value="${attr(m ? m.phone || '' : '')}"></label></div>
      <div class="row"><label>우편번호 <input name="zipcode" maxlength="10" value="${attr(m ? m.zipcode || '' : '')}"></label><label>주소 <input name="addr1" maxlength="120" value="${attr(m ? m.addr1 || '' : '')}"></label></div>
      <label>상세 주소 <input name="addr2" maxlength="120" value="${attr(m ? m.addr2 || '' : '')}"></label>
    </div>
    <label>요청 사항 <textarea name="memo" rows="3" maxlength="500" placeholder="각인 문구, 방문 희망 일시 등"></textarea></label>
    <h2>할인</h2>
    <div class="row"><label>쿠폰 번호 <input name="coupon_code" maxlength="30" placeholder="쿠폰이 있으면 입력"></label>
      <label>적립금 사용 <input name="point_use" type="number" min="0" step="10" value="0" ${m ? '' : 'disabled placeholder="회원 전용"'}></label></div>
    ${m ? `<p class="note">보유 적립금 ${fmtNum(m.points)}원</p>` : '<p class="note"><a href="/login?next=/checkout">로그인</a>하시면 적립금·쿠폰을 사용하고 주문 내역을 조회할 수 있습니다.</p>'}
    <h2>결제 수단</h2>
    <div class="radio-row"><label><input type="radio" name="pay_method" value="bank" checked> 무통장 입금</label><label><input type="radio" name="pay_method" value="card"${getSetting('pg_client_key') ? '' : ' disabled'}> 카드 결제${getSetting('pg_client_key') ? '' : ' (준비 중)'}</label></div>
    <p class="note" id="bankNote">${esc(settings.cfg('bank_info') || '입금 계좌는 주문 완료 후 안내드립니다.')}</p>
    <label class="agree"><input type="checkbox" name="agree" required> <a href="/privacy" target="_blank">개인정보 수집·이용</a> 및 주문 내용에 동의합니다.</label>
    <button class="btn btn-gold block lg" type="submit">결제하기</button>
    <p class="form-msg" aria-live="polite"></p>
  </form>
  <aside class="cart-sum">
    <h2>결제 금액</h2>
    <dl id="coSum"><dt>상품 금액</dt><dd>${money(t.itemsTotal)}</dd><dt>배송비</dt><dd>${t.shipping ? money(t.shipping) : '무료'}</dd></dl>
    <p class="cs-total">합계 <b id="coTotal">${money(t.itemsTotal + t.shipping)}</b></p>
  </aside>
</div></section>`;
  res.send(page({ title: '주문서 작성', description: '문강금은 온라인몰 주문서', path: '/checkout', body, bodyClass: 'shop', noindex: true, ...c }));
});

// ── 주문 완료 ──
router.get('/order/:no', (req, res, next) => {
  const o = cart.findOrder(req.params.no); if (!o) return next();
  const c = ctx(req, res);
  const items = cart.orderItems(o.id);
  const body = `
<section class="page-head"><div class="wrap"><h1>주문이 접수되었습니다</h1><p class="bluf">주문번호 <b>${esc(o.order_no)}</b> · ${STATUS[o.status]}</p></div></section>
<section class="section"><div class="wrap narrow">
  <ul class="co-items">${items.map((i) => `<li><b>${esc(i.name)}</b>${i.option_text ? ` <small>${esc(i.option_text)}</small>` : ''} <span>${i.qty}개</span><em>${money(i.unit_price * i.qty)}</em></li>`).join('')}</ul>
  <dl class="order-sum"><dt>상품 금액</dt><dd>${money(o.items_total)}</dd><dt>배송비</dt><dd>${o.shipping_fee ? money(o.shipping_fee) : '무료'}</dd>
    ${o.coupon_discount ? `<dt>쿠폰 할인</dt><dd>-${money(o.coupon_discount)}</dd>` : ''}${o.point_used ? `<dt>적립금 사용</dt><dd>-${money(o.point_used)}</dd>` : ''}
    <dt><b>결제 금액</b></dt><dd><b>${money(o.total)}</b></dd></dl>
  ${o.pay_method === 'bank' ? `<div class="bank-box"><h2>입금 안내</h2><p>${esc(settings.cfg('bank_info') || '입금 계좌는 전화로 안내드립니다.')}</p><p class="note">입금자명과 주문자명이 다르면 요청 사항에 남겨 주세요. 입금 확인 후 상품을 준비합니다.</p></div>` : ''}
  <p class="center"><a class="btn btn-ghost" href="/order-lookup">주문조회</a> <a class="btn btn-gold" href="/products">쇼핑 계속하기</a></p>
</div></section>`;
  res.send(page({ title: `주문 완료 ${o.order_no}`, description: '주문이 접수되었습니다.', path: `/order/${o.order_no}`, body, bodyClass: 'shop', noindex: true, ...c }));
});

// ── 주문조회(비회원) ──
router.get('/order-lookup', (req, res) => {
  const c = ctx(req, res);
  const no = String(req.query.no || '').trim(); const phone = String(req.query.phone || '').trim();
  let found = null;
  if (no && phone) {
    const o = cart.findOrder(no);
    if (o && o.buyer_phone.replace(/\D/g, '').slice(-8) === phone.replace(/\D/g, '').slice(-8)) found = o;
  }
  const body = `
<section class="page-head"><div class="wrap"><h1>주문조회</h1><p class="bluf">주문번호와 주문자 연락처로 진행 상황을 확인하실 수 있습니다.</p></div></section>
<section class="section"><div class="wrap narrow">
  <form class="inq-form" method="get" action="/order-lookup">
    <div class="row"><label>주문번호 <input name="no" value="${attr(no)}" required placeholder="251006-1234"></label><label>연락처 <input name="phone" value="${attr(phone)}" required inputmode="tel" placeholder="010-0000-0000"></label></div>
    <button class="btn btn-gold block" type="submit">조회하기</button>
  </form>
  ${no && phone ? (found ? `<div class="order-card"><h2>${esc(found.order_no)}</h2><p>${dateOf(found.created_at)} · <b>${STATUS[found.status]}</b></p>
    <ul class="co-items">${cart.orderItems(found.id).map((i) => `<li><b>${esc(i.name)}</b> <span>${i.qty}개</span><em>${money(i.unit_price * i.qty)}</em></li>`).join('')}</ul>
    <p>결제 금액 <b>${money(found.total)}</b>${found.tracking_no ? ` · 운송장 ${esc(found.courier || '')} ${esc(found.tracking_no)}` : ''}</p></div>`
    : '<p class="note">주문번호와 연락처를 다시 확인해 주세요.</p>') : ''}
</div></section>`;
  res.send(page({ title: '주문조회', description: '문강금은 온라인몰 주문조회', path: '/order-lookup', body, bodyClass: 'shop', noindex: true, ...c }));
});

// ── 회원 ──
const authForm = (mode, next) => `
<section class="page-head"><div class="wrap"><h1>${mode === 'login' ? '로그인' : '회원가입'}</h1></div></section>
<section class="section"><div class="wrap narrow">
  <form class="inq-form" id="${mode}Form">
    <input type="hidden" name="next" value="${attr(next || '/')}">
    <label>이메일 <input name="email" type="email" required maxlength="80" autocomplete="username"></label>
    <label>비밀번호 <input name="pw" type="password" required minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="8자 이상"></label>
    ${mode === 'signup' ? `<div class="row"><label>이름 <input name="name" required maxlength="40"></label><label>연락처 <input name="phone" maxlength="20" inputmode="tel" placeholder="010-0000-0000"></label></div>
    <div class="row"><label>우편번호 <input name="zipcode" maxlength="10"></label><label>주소 <input name="addr1" maxlength="120"></label></div>
    <label>상세 주소 <input name="addr2" maxlength="120"></label>
    <label class="agree"><input type="checkbox" name="agree" required> <a href="/privacy" target="_blank">개인정보 수집·이용</a>에 동의합니다.</label>
    <label class="agree"><input type="checkbox" name="marketing"> 할인·신상품 소식을 받겠습니다. (선택)</label>` : ''}
    <button class="btn btn-gold block lg" type="submit">${mode === 'login' ? '로그인' : '가입하기'}</button>
    <p class="form-msg" aria-live="polite"></p>
    <p class="center note">${mode === 'login' ? '처음이신가요? <a href="/signup">회원가입</a>' : '이미 회원이신가요? <a href="/login">로그인</a>'}</p>
  </form>
</div></section>`;

router.get('/login', (req, res) => {
  const c = ctx(req, res); if (c.me) return res.redirect('/mypage');
  res.send(page({ title: '로그인', description: '문강금은 온라인몰 로그인', path: '/login', body: authForm('login', req.query.next), bodyClass: 'shop', noindex: true, ...c }));
});
router.get('/signup', (req, res) => {
  const c = ctx(req, res); if (c.me) return res.redirect('/mypage');
  res.send(page({ title: '회원가입', description: '문강금은 온라인몰 회원가입', path: '/signup', body: authForm('signup', req.query.next), bodyClass: 'shop', noindex: true, ...c }));
});
router.get('/logout', (req, res) => { member.clearCookie(res); res.redirect('/'); });

router.get('/mypage', need, (req, res) => {
  const c = ctx(req, res); const m = c.me;
  const orders = db.prepare('SELECT * FROM orders WHERE member_id=? ORDER BY id DESC LIMIT 20').all(m.id);
  const wish = db.prepare('SELECT p.* FROM wishlists w JOIN products p ON p.id=w.product_id WHERE w.member_id=? ORDER BY w.id DESC LIMIT 12').all(m.id);
  const points = db.prepare('SELECT * FROM point_ledger WHERE member_id=? ORDER BY id DESC LIMIT 20').all(m.id);
  const qna = db.prepare('SELECT * FROM qna WHERE member_id=? ORDER BY id DESC LIMIT 10').all(m.id);
  const body = `
<section class="page-head"><div class="wrap"><h1>마이페이지</h1><p class="bluf">${esc(m.name)}님 · 적립금 <b>${fmtNum(m.points)}원</b></p></div></section>
<section class="section"><div class="wrap">
  <h2>주문·배송 조회</h2>
  ${orders.length ? `<div class="tbl-wrap"><table class="order-table"><thead><tr><th>주문번호</th><th>주문일</th><th>상품</th><th class="num">결제금액</th><th>상태</th></tr></thead><tbody>
    ${orders.map((o) => { const it = cart.orderItems(o.id); return `<tr><td><a href="/order/${attr(o.order_no)}">${esc(o.order_no)}</a></td><td>${dateOf(o.created_at)}</td><td>${esc(it[0] ? it[0].name : '')}${it.length > 1 ? ` 외 ${it.length - 1}건` : ''}</td><td class="num">${money(o.total)}</td><td>${STATUS[o.status]}${o.tracking_no ? `<br><small>${esc(o.courier || '')} ${esc(o.tracking_no)}</small>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div>` : '<p class="note">주문 내역이 없습니다.</p>'}
  <h2>찜한 상품</h2>
  ${wish.length ? `<div class="pgrid">${wish.map(productCard).join('')}</div>` : '<p class="note">찜한 상품이 없습니다.</p>'}
  <h2>적립금</h2>
  ${points.length ? `<ul class="point-list">${points.map((p) => `<li><span>${dateOf(p.created_at)}</span><b class="${p.amount > 0 ? 'up' : 'down'}">${p.amount > 0 ? '+' : ''}${fmtNum(p.amount)}원</b><small>${esc(p.reason || '')}${p.order_no ? ' · ' + esc(p.order_no) : ''}</small></li>`).join('')}</ul>` : '<p class="note">적립 내역이 없습니다.</p>'}
  <h2>1:1 문의</h2>
  ${qna.length ? `<ul class="qna-list">${qna.map((q) => `<li><b>${esc(q.title)}</b><span>${dateOf(q.created_at)}</span>${q.answer ? `<div class="qna-a"><b>답변</b> ${esc(q.answer)}</div>` : '<small class="muted">답변 대기</small>'}</li>`).join('')}</ul>` : '<p class="note">문의 내역이 없습니다. <a href="/cs">1:1 문의하기 →</a></p>'}
  <h2>회원 정보</h2>
  <form class="inq-form" id="profileForm">
    <div class="row"><label>이름 <input name="name" value="${attr(m.name)}" required maxlength="40"></label><label>연락처 <input name="phone" value="${attr(m.phone || '')}" maxlength="20"></label></div>
    <div class="row"><label>우편번호 <input name="zipcode" value="${attr(m.zipcode || '')}" maxlength="10"></label><label>주소 <input name="addr1" value="${attr(m.addr1 || '')}" maxlength="120"></label></div>
    <label>상세 주소 <input name="addr2" value="${attr(m.addr2 || '')}" maxlength="120"></label>
    <label>새 비밀번호 <input name="pw" type="password" minlength="8" placeholder="바꿀 때만 입력 (8자 이상)"></label>
    <button class="btn btn-gold" type="submit">저장</button><p class="form-msg" aria-live="polite"></p>
  </form>
</div></section>`;
  res.send(page({ title: '마이페이지', description: '주문·배송 조회, 찜, 적립금', path: '/mypage', body, bodyClass: 'shop', noindex: true, ...c }));
});

// ── 고객센터(공지·1:1 문의) ──
router.get('/cs', (req, res) => {
  const c = ctx(req, res);
  const notices = db.prepare("SELECT * FROM posts WHERE kind='notice' AND status='published' ORDER BY published_at DESC LIMIT 10").all();
  const s = settings.all();
  const body = `
<section class="page-head"><div class="wrap"><h1>고객센터</h1><p class="bluf">전화 ${esc(s.phone)} · 매일 ${esc(s.hours_open)}–${esc(s.hours_close)} · 카카오톡 상담은 24시간 접수</p></div></section>
<section class="section"><div class="wrap grid2">
  <div class="main-col">
    <h2>공지사항</h2>
    ${notices.length ? `<ul class="notice-list">${notices.map((n) => `<li><a href="/notice/${attr(n.slug)}">${esc(n.title)}</a><span>${dateOf(n.published_at || n.created_at)}</span></li>`).join('')}</ul>` : '<p class="note">등록된 공지가 없습니다.</p>'}
    <h2>1:1 문의</h2>
    <form class="inq-form" id="qnaForm">
      <div class="row"><label>이름 <input name="name" required maxlength="40" value="${attr(c.me ? c.me.name : '')}"></label><label>연락처 <input name="phone" maxlength="20" inputmode="tel" value="${attr(c.me ? c.me.phone || '' : '')}"></label></div>
      <div class="row"><label>문의 유형 <select name="kind"><option value="order">주문·결제</option><option value="product">상품</option><option value="delivery">배송</option><option value="etc">기타</option></select></label>
        <label>이메일 <input name="email" type="email" maxlength="80" value="${attr(c.me ? c.me.email : '')}"></label></div>
      <label>제목 <input name="title" required maxlength="80"></label>
      <label>내용 <textarea name="body" rows="5" required maxlength="2000"></textarea></label>
      <label class="agree"><input type="checkbox" name="agree" required> <a href="/privacy" target="_blank">개인정보 수집·이용</a>에 동의합니다.</label>
      <button class="btn btn-gold block" type="submit">문의 등록</button><p class="form-msg" aria-live="polite"></p>
    </form>
  </div>
  <aside class="side-col"><div class="side-card"><h3>빠른 메뉴</h3><ul class="side-list"><li><a href="/order-lookup">주문조회</a></li><li><a href="/faq">자주 묻는 질문</a></li><li><a href="/mypage">마이페이지</a></li><li><a href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오톡 상담</a></li></ul></div>
  <div class="side-card"><h3>입금 계좌</h3><p class="f-bank">${esc(s.bank_info || '주문 후 안내드립니다.')}</p></div></aside>
</div></section>`;
  res.send(page({ title: '고객센터 — 공지사항·1:1 문의', description: '문강금은 온라인몰 고객센터. 공지사항과 1:1 문의, 주문조회.', path: '/cs', body, bodyClass: 'shop', ...c }));
});

module.exports = { router, ctx };
