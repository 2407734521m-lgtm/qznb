import { useState } from 'react';
import alipayUrl from '../assets/alipay-sponsor.jpg';

// 赞助弹窗：先看自愿赞助知情同意书，同意后才显示支付宝收款码
export default function SponsorModal({ onClose }: { onClose: () => void }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="crop-mask" onClick={onClose}>
      <div className="card" style={{ width: 'min(92vw, 420px)', margin: 0, maxHeight: '86vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        {!agreed ? (
          <>
            <h3 style={{ marginTop: 0 }}>赞助知情同意书</h3>
            <div style={{ fontSize: 13.5, lineHeight: 1.8 }}>
              <p>在赞助之前，请先阅读以下内容：</p>
              <p>1. <b>完全自愿</b>：赞助全凭自愿，不赞助不影响网站任何功能的使用，也不会有任何区别对待。</p>
              <p>2. <b>款项用途</b>：赞助款项将用于网站的域名、服务器及日常维护开销。</p>
              <p>3. <b>无偿性质</b>：赞助属于无偿支持，不换取任何特权、功能、服务或其他回报。</p>
              <p>4. <b>未成年人请勿赞助</b>：未满 18 周岁请不要赞助，把零花钱留给自己。</p>
              <p>5. <b>确认后再转</b>：转账前请核对收款码信息；赞助款直接到达收款账户，原则上不予退还，请想清楚再操作。</p>
              <p className="mut">点击下方按钮，即表示你已阅读、理解并同意以上全部内容。</p>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="ghost" style={{ flex: 1 }} onClick={onClose}>再想想</button>
              <button className="pri" style={{ flex: 1 }} onClick={() => setAgreed(true)}>我已阅读并同意</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>赞助</h3>
            <p className="mut" style={{ fontSize: 13 }}>打开支付宝扫一扫，金额随意，心意最重要。谢谢你的支持。</p>
            <img src={alipayUrl} alt="支付宝收款码" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
            <button className="pri" style={{ marginTop: 12 }} onClick={onClose}>关闭</button>
          </>
        )}
      </div>
    </div>
  );
}
