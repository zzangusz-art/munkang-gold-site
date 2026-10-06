'use strict';
// 상품 카드 — 홈·목록·상세에서 공통으로 쓴다
const quotes = require('./quotes');
const { CAT_LABEL } = require('./content/templates');
const { esc, attr, fmtNum } = require('./util');

function optionTag(p) {
  const st = quotes.stoneOptions(p);
  if (!st.length && !p.karat_option) return '';
  const parts = [p.karat_option ? '14K·18K' : '', st.map((x) => x.name).join('·')].filter(Boolean);
  return `<p class="pc-opt">${esc(parts.join(' / '))} 선택</p>`;
}

function productCard(p) {
  const pr = quotes.productPrice(p);
  const badge = p.ready_today ? '<span class="badge badge-today">오늘 출발</span>' : p.badge ? `<span class="badge">${esc(p.badge)}</span>` : '';
  const img = p.image
    ? `<img src="${attr(p.image)}" alt="${attr(p.name)}" loading="lazy">`
    : `<span class="pc-glyph">${p.metal === 'silver' ? 'Ag' : 'Au'}</span><span class="pc-w">${p.weight_g}g</span>`;
  return `<a class="pcard" href="/products/${attr(p.slug)}" data-cat="${attr(p.category)}" data-name="${attr(p.name)}" data-price="${pr.price || 0}" data-weight="${p.weight_g || 0}">
  <div class="pc-img ${attr(p.metal)}">${img}${badge}</div>
  <div class="pc-body"><span class="pc-cat">${CAT_LABEL[p.category] || ''}</span><h3>${esc(p.name)}</h3>
  <p class="pc-price">${pr.price ? `<b>${fmtNum(pr.price)}원</b>` : '<b>시세 문의</b>'}</p>${optionTag(p)}</div></a>`;
}

module.exports = { productCard, optionTag };
