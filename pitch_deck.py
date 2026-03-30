"""
Dividend Fantasy - Investor Pitch Deck Generator
Creates a professional PDF pitch deck
"""

from fpdf import FPDF
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from io import BytesIO
import os

# Colors
DARK_BG = (17, 24, 39)  # Dark blue-gray
ORANGE = (249, 115, 22)  # Primary accent
PINK = (236, 72, 153)    # Secondary accent
WHITE = (255, 255, 255)
GRAY = (156, 163, 175)
LIGHT_GRAY = (75, 85, 99)
GREEN = (34, 197, 94)
RED = (239, 68, 68)

class PitchDeck(FPDF):
    def __init__(self):
        super().__init__('L', 'mm', 'A4')  # Landscape
        self.set_auto_page_break(False)

    def add_slide(self):
        self.add_page()
        # Dark background
        self.set_fill_color(*DARK_BG)
        self.rect(0, 0, 297, 210, 'F')

    def gradient_text(self, x, y, text, size=48):
        """Draw gradient-style text (orange)"""
        self.set_font('Helvetica', 'B', size)
        self.set_text_color(*ORANGE)
        self.set_xy(x, y)
        self.cell(0, 0, text)

    def slide_title(self, text, y=40):
        """Main slide title"""
        self.set_font('Helvetica', 'B', 36)
        self.set_text_color(*WHITE)
        self.set_xy(30, y)
        self.cell(0, 0, text)

    def slide_subtitle(self, text, y=55):
        """Slide subtitle"""
        self.set_font('Helvetica', '', 18)
        self.set_text_color(*GRAY)
        self.set_xy(30, y)
        self.cell(0, 0, text)

    def body_text(self, text, x, y, size=14, color=WHITE):
        """Body text"""
        self.set_font('Helvetica', '', size)
        self.set_text_color(*color)
        self.set_xy(x, y)
        self.multi_cell(230, 8, text)

    def bullet(self, text, x, y, size=14):
        """Bullet point"""
        self.set_font('Helvetica', '', size)
        self.set_text_color(*GRAY)
        self.set_xy(x, y)
        self.set_text_color(*ORANGE)
        self.cell(8, 0, '>')  # bullet
        self.set_text_color(*WHITE)
        self.cell(0, 0, text)

    def stat_box(self, x, y, value, label, w=70, h=50):
        """Stat highlight box"""
        # Box background
        self.set_fill_color(*LIGHT_GRAY)
        self.rect(x, y, w, h, 'F')

        # Value
        self.set_font('Helvetica', 'B', 28)
        self.set_text_color(*ORANGE)
        self.set_xy(x, y + 10)
        self.cell(w, 0, value, align='C')

        # Label
        self.set_font('Helvetica', '', 11)
        self.set_text_color(*GRAY)
        self.set_xy(x, y + 30)
        self.cell(w, 0, label, align='C')

    def section_label(self, x, y, text):
        """Small section label"""
        self.set_font('Helvetica', 'B', 10)
        self.set_text_color(*ORANGE)
        self.set_xy(x, y)
        self.cell(0, 0, text.upper())


def create_fee_flow_chart():
    """Create fee flow diagram"""
    fig, ax = plt.subplots(figsize=(10, 4))
    fig.patch.set_facecolor('#111827')
    ax.set_facecolor('#111827')

    # Hide axes
    ax.axis('off')
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4)

    # Boxes
    boxes = [
        (0.5, 1.5, 2, 1, 'Trading Fee\n1.5%', '#F97316'),
        (4, 2.5, 2, 0.8, 'Dividend Pool\n67%', '#22C55E'),
        (4, 0.7, 2, 0.8, 'Protocol\n33%', '#3B82F6'),
        (7.5, 3, 2, 0.6, 'Base (20%)\nAll Holders', '#A855F7'),
        (7.5, 2, 2, 0.6, 'Outperformers\n(80%)', '#EC4899'),
    ]

    for x, y, w, h, text, color in boxes:
        rect = mpatches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.05",
                                        facecolor=color, edgecolor='white', linewidth=1)
        ax.add_patch(rect)
        ax.text(x + w/2, y + h/2, text, ha='center', va='center',
                color='white', fontsize=9, fontweight='bold')

    # Arrows
    arrow_props = dict(arrowstyle='->', color='white', lw=2)
    ax.annotate('', xy=(4, 2.9), xytext=(2.5, 2), arrowprops=arrow_props)
    ax.annotate('', xy=(4, 1.1), xytext=(2.5, 2), arrowprops=arrow_props)
    ax.annotate('', xy=(7.5, 3.3), xytext=(6, 2.9), arrowprops=arrow_props)
    ax.annotate('', xy=(7.5, 2.3), xytext=(6, 2.9), arrowprops=arrow_props)

    plt.tight_layout()
    
    # Save to bytes
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=150, facecolor='#111827', bbox_inches='tight')
    plt.close()
    buf.seek(0)
    return buf

def create_revenue_chart():
    """Create revenue projection chart"""
    fig, ax = plt.subplots(figsize=(8, 4))
    fig.patch.set_facecolor('#111827')
    ax.set_facecolor('#111827')

    months = ['M1', 'M3', 'M6', 'M12', 'M18', 'M24']
    users = [100, 500, 2000, 10000, 25000, 50000]
    revenue = [500, 2500, 15000, 100000, 300000, 750000]

    # Plot
    ax.bar(months, [r/1000 for r in revenue], color='#F97316', alpha=0.8)

    # Add user count on top
    for i, (m, u, r) in enumerate(zip(months, users, revenue)):
        ax.text(i, r/1000 + 20, f'{u:,} users', ha='center', va='bottom',
                color='#9CA3AF', fontsize=9)

    ax.set_ylabel('Monthly Revenue ($K)', color='white', fontsize=11)
    ax.tick_params(colors='white')
    ax.spines['bottom'].set_color('white')
    ax.spines['left'].set_color('white')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    plt.tight_layout()

    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=150, facecolor='#111827', bbox_inches='tight')
    plt.close()
    buf.seek(0)
    return buf

def create_unit_economics_chart():
    """Create unit economics pie chart"""
    fig, ax = plt.subplots(figsize=(5, 5))
    fig.patch.set_facecolor('#111827')

    labels = ['Dividends\n(to users)', 'Protocol\nRevenue']
    sizes = [67, 33]
    colors = ['#22C55E', '#F97316']
    explode = (0, 0.05)

    wedges, texts, autotexts = ax.pie(sizes, explode=explode, labels=labels, colors=colors,
                                       autopct='%1.0f%%', startangle=90,
                                       textprops={'color': 'white', 'fontsize': 12})

    for autotext in autotexts:
        autotext.set_color('white')
        autotext.set_fontweight('bold')
        autotext.set_fontsize(14)

    ax.set_title('Fee Distribution (1.5% per trade)', color='white', fontsize=14, pad=20)

    plt.tight_layout()

    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=150, facecolor='#111827', bbox_inches='tight')
    plt.close()
    buf.seek(0)
    return buf


def build_deck():
    pdf = PitchDeck()
    # ==================== SLIDE 1: Title ====================
    pdf.add_slide()

    # Logo/Icon area - draw a circle instead
    pdf.set_fill_color(*ORANGE)
    pdf.ellipse(30, 45, 25, 25, 'F')

    # Title
    pdf.set_font('Helvetica', 'B', 52)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(30, 75)
    pdf.cell(0, 0, 'Dividend Fantasy')

    # Tagline
    pdf.set_font('Helvetica', '', 24)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(30, 95)
    pdf.cell(0, 0, 'Trade Athletes Like Stocks. Earn Weekly Dividends.')

    # Bottom stats
    pdf.stat_box(30, 140, '$26B', 'Fantasy Sports Market', 70, 45)
    pdf.stat_box(110, 140, '$93B', 'Sports Betting Market', 70, 45)
    pdf.stat_box(190, 140, '60M+', 'Fantasy Players (US)', 70, 45)

    # ==================== SLIDE 2: Problem ====================
    pdf.add_slide()
    pdf.section_label(30, 25, 'The Problem')
    pdf.slide_title('Fantasy Sports is Broken', 35)

    problems = [
        ('Season-Long Commitment', "Draft once, stuck all season. Injured player? Too bad."),
        ('Zero Financial Upside', "Pay entry fees, maybe win a trophy. No real returns."),
        ('All-or-Nothing', "Finish 2nd in a 12-team league? You get nothing."),
        ('No Liquidity', "Can't exit your position. Can't trade freely."),
    ]

    y = 70
    for title, desc in problems:
        pdf.set_font('Helvetica', 'B', 16)
        pdf.set_text_color(*RED)
        pdf.set_xy(30, y)
        pdf.cell(0, 0, 'X' + '  ' + title)

        pdf.set_font('Helvetica', '', 13)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(45, y + 10)
        pdf.cell(0, 0, desc)
        y += 30

    # ==================== SLIDE 3: Solution ====================
    pdf.add_slide()
    pdf.section_label(30, 25, 'The Solution')
    pdf.slide_title('A Stock Market for Athletes', 35)
    pdf.slide_subtitle('Trade players like stocks. Earn dividends based on performance.', 50)

    solutions = [
        ('Liquid Market', "Buy and sell player shares anytime via our AMM"),
        ('Weekly Dividends', "Earn real returns when your players outperform"),
        ('Performance-Based', "Better picks = higher dividends. Skill is rewarded."),
        ('Web3 Native', "On-chain transparency. Your assets, your control."),
    ]

    y = 75
    for title, desc in solutions:
        pdf.set_font('Helvetica', 'B', 16)
        pdf.set_text_color(*GREEN)
        pdf.set_xy(30, y)
        pdf.cell(0, 0, '+' + '  ' + title)

        pdf.set_font('Helvetica', '', 13)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(45, y + 10)
        pdf.cell(0, 0, desc)
        y += 28

    # ==================== SLIDE 4: How It Works ====================
    pdf.add_slide()
    pdf.section_label(30, 25, 'How It Works')
    pdf.slide_title('Three Simple Steps', 35)

    # Step boxes
    steps = [
        ('1', 'Buy Player Shares', 'Trade via AMM.\nPrices move with demand.', 30),
        ('2', 'Players Perform', 'Weekly fantasy points\nvs projections.', 115),
        ('3', 'Earn Dividends', 'Outperformers share\nthe weekly fee pool.', 200),
    ]

    for num, title, desc, x in steps:
        # Number circle
        pdf.set_fill_color(*ORANGE)
        pdf.ellipse(x + 25, 60, 20, 20, 'F')
        pdf.set_font('Helvetica', 'B', 18)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(x + 25, 65)
        pdf.cell(20, 10, num, align='C')

        # Title
        pdf.set_font('Helvetica', 'B', 16)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(x, 90)
        pdf.cell(70, 0, title, align='C')

        # Description
        pdf.set_font('Helvetica', '', 12)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(x, 100)
        pdf.multi_cell(70, 6, desc, align='C')

    # Bottom explanation
    pdf.set_fill_color(*LIGHT_GRAY)
    pdf.rect(30, 135, 237, 55, 'F')

    pdf.set_font('Helvetica', 'B', 14)
    pdf.set_text_color(*ORANGE)
    pdf.set_xy(40, 142)
    pdf.cell(0, 0, 'The AMM (Automated Market Maker)')

    pdf.set_font('Helvetica', '', 12)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(40, 155)
    pdf.multi_cell(220, 6,
        "Each player has a liquidity pool using the constant product formula (x * y = k). "
        "When you buy shares, the price increases. When you sell, it decreases. "
        "This creates a self-balancing market where popular players naturally become more expensive, "
        "and undervalued players present buying opportunities.")

    # ==================== SLIDE 5: Dividend Math ====================
    pdf.add_slide()
    pdf.section_label(30, 25, 'The Math')
    pdf.slide_title('Dividend Distribution', 35)

    # Create and save chart
    chart_buf = create_fee_flow_chart()
    chart_path = '/tmp/fee_flow.png'
    with open(chart_path, 'wb') as f:
        f.write(chart_buf.read())

    pdf.image(chart_path, x=30, y=55, w=160)

    # Right side explanation
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(200, 55)
    pdf.cell(0, 0, 'Outperformance Formula:')

    pdf.set_font('Courier', '', 10)
    pdf.set_text_color(*ORANGE)
    pdf.set_xy(200, 65)
    pdf.multi_cell(80, 5, '(actual - projected)\n/ projected')

    pdf.set_font('Helvetica', '', 11)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(200, 85)
    pdf.multi_cell(80, 5,
        "Players who beat their projection share the outperformer pool proportionally.")

    # Example box
    pdf.set_fill_color(*LIGHT_GRAY)
    pdf.rect(30, 125, 237, 65, 'F')

    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*ORANGE)
    pdf.set_xy(40, 132)
    pdf.cell(0, 0, 'Example: $1,000 Weekly Fees')

    example_text = """
Fee Split: $670 to dividends, $330 to protocol
Dividend Split: $134 base (all holders), $536 to outperformers

Player A: +30% outperformance -> Gets 66.7% of $536 = $357
Player B: +15% outperformance -> Gets 33.3% of $536 = $179
Player C: -10% (underperformed) -> Gets $0

If you own 10% of Player A shares, you receive:
  Base dividend: ~$13 + Outperformer: $35.70 = $48.70 total
"""
    pdf.set_font('Courier', '', 10)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(40, 142)
    pdf.multi_cell(220, 5, example_text.strip())

    # ==================== SLIDE 6: Business Model ====================
    pdf.add_slide()
    pdf.section_label(30, 25, 'Business Model')
    pdf.slide_title('Revenue From Every Trade', 35)

    # Left side - pie chart
    pie_buf = create_unit_economics_chart()
    pie_path = '/tmp/unit_econ.png'
    with open(pie_path, 'wb') as f:
        f.write(pie_buf.read())

    pdf.image(pie_path, x=25, y=55, w=90)

    # Right side - metrics
    pdf.set_font('Helvetica', 'B', 14)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(130, 55)
    pdf.cell(0, 0, 'Unit Economics')

    metrics = [
        ('Trading Fee', '1.5%'),
        ('Protocol Take', '0.5% (33% of fee)'),
        ('Avg Trade Size', '$25'),
        ('Revenue/Trade', '$0.125'),
        ('Trades/User/Week', '~10'),
        ('Revenue/User/Week', '$1.25'),
        ('LTV (6 months)', '$32.50'),
    ]

    y = 68
    for label, value in metrics:
        pdf.set_font('Helvetica', '', 11)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(130, y)
        pdf.cell(60, 0, label)

        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(200, y)
        pdf.cell(0, 0, value)
        y += 12

    # Bottom - key insight
    pdf.set_fill_color(*LIGHT_GRAY)
    pdf.rect(30, 155, 237, 35, 'F')

    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*ORANGE)
    pdf.set_xy(40, 163)
    pdf.cell(0, 0, 'Key Insight: Volume is Everything')

    pdf.set_font('Helvetica', '', 11)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(40, 175)
    pdf.multi_cell(220, 5,
        "Higher trading volume = more fees = higher dividends = more users = more volume. "
        "This creates a powerful flywheel effect. Early users are rewarded with higher yields, "
        "incentivizing growth and retention.")

    # ==================== SLIDE 7: Revenue Projections ====================
    pdf.add_slide()
    pdf.section_label(30, 25, 'Projections')
    pdf.slide_title('Revenue Growth', 35)

    # Revenue chart
    rev_buf = create_revenue_chart()
    rev_path = '/tmp/revenue.png'
    with open(rev_path, 'wb') as f:
        f.write(rev_buf.read())

    pdf.image(rev_path, x=30, y=55, w=150)

    # Assumptions
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(190, 55)
    pdf.cell(0, 0, 'Assumptions')

    assumptions = [
        '$50 avg deposit',
        '30x annual turnover',
        '0.5% protocol fee',
        '15% monthly growth',
    ]

    y = 70
    for a in assumptions:
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(190, y)
        pdf.cell(0, 0, '-' + ' ' + a)
        y += 10

    # Milestones
    pdf.set_fill_color(*LIGHT_GRAY)
    pdf.rect(30, 145, 237, 45, 'F')

    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*ORANGE)
    pdf.set_xy(40, 152)
    pdf.cell(0, 0, 'Milestones')

    milestones = [
        ('10K users', '$100K MRR', 'Month 12'),
        ('50K users', '$750K MRR', 'Month 24'),
        ('200K users', '$3M MRR', 'Month 36'),
    ]

    x = 50
    for users, mrr, timing in milestones:
        pdf.set_font('Helvetica', 'B', 14)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(x, 165)
        pdf.cell(60, 0, users)

        pdf.set_font('Helvetica', 'B', 14)
        pdf.set_text_color(*GREEN)
        pdf.set_xy(x, 175)
        pdf.cell(60, 0, mrr)

        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(x, 183)
        pdf.cell(60, 0, timing)

        x += 75

    # ==================== SLIDE 8: Why Now ====================
    pdf.add_slide()
    pdf.section_label(30, 25, 'Timing')
    pdf.slide_title('Why Now?', 35)

    reasons = [
        ('Sports Betting Legalization',
         "38 states now legal. $93B market growing 10%+ annually. Users are comfortable betting on sports."),
        ('Web3 Infrastructure Matured',
         "L2s like Base offer <$0.01 transactions. Wallet UX is finally good. Mainstream ready."),
        ('Fantasy Fatigue',
         "Season-long formats are dying. Daily fantasy peaked. Users want something new."),
        ('Proven Models Exist',
         "Polymarket proved prediction markets work. DeFi proved AMMs work. We combine both."),
    ]

    y = 60
    for title, desc in reasons:
        pdf.set_font('Helvetica', 'B', 14)
        pdf.set_text_color(*ORANGE)
        pdf.set_xy(30, y)
        pdf.cell(0, 0, title)

        pdf.set_font('Helvetica', '', 12)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(30, y + 10)
        pdf.multi_cell(237, 5, desc)
        y += 35

    # ==================== SLIDE 9: Summary ====================
    pdf.add_slide()

    # Big title
    pdf.set_font('Helvetica', 'B', 48)
    pdf.set_text_color(*ORANGE)
    pdf.set_xy(30, 50)
    pdf.cell(0, 0, 'Dividend Fantasy')

    pdf.set_font('Helvetica', '', 24)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(30, 75)
    pdf.cell(0, 0, 'The Future of Fantasy Sports')

    # Summary points
    summary = [
        "Trade NBA players like stocks via AMM",
        "Earn weekly dividends based on real performance",
        "1.5% fee per trade, 33% protocol revenue",
        "Built on Base (Coinbase L2)",
        "MVP complete. Ready to launch.",
    ]

    y = 105
    for point in summary:
        pdf.set_font('Helvetica', '', 16)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(30, y)
        pdf.cell(0, 0, '+' + '   ' + point)
        y += 15

    # Contact
    pdf.set_font('Helvetica', 'B', 14)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(30, 180)
    pdf.cell(0, 0, 'hello@dividendfantasy.xyz')

    # Save
    output_path = '/Users/samsyy/Desktop/dividend_fantasy/Dividend_Fantasy_Pitch_Deck.pdf'
    pdf.output(output_path)
    print(f"Pitch deck saved to: {output_path}")
    return output_path


if __name__ == "__main__":
    build_deck()
