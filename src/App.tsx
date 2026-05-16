import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { db } from './utils/firebase';
import { Product, Demand, CartItem } from './types';
import { ShoppingCart, Lock, Package, Bell, X, Trash2, Edit3, Camera, Check, Copy, ChevronRight, Star, Plus, Minus, Send, Phone, Heart, Share2, ArrowUpDown, TrendingUp, AlertCircle, Search, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './utils/cn';
import { fmt, today, generatePixPayload, compressImage } from './utils/shopUtils';
import { useGuardBot, GuardBotOverlay } from './utils/security';
import { QRCodeSVG } from 'qrcode.react';

// --- CONFIG ---
const FALLBACK_PIX = "06515285426";
const FALLBACK_WPP = "5506515285426";

const CATEGORIES = [
  { id: 'todos', label: 'Todos', icon: '✨' },
  { id: 'perfumes', label: 'Perfumes', icon: '🌸' },
  { id: 'skincare', label: 'Skincare', icon: '✨' },
  { id: 'make', label: 'Maquiagem', icon: '💄' },
  { id: 'cabelo', label: 'Cabelo', icon: '💆‍♀️' },
  { id: 'corpo', label: 'Corpo', icon: '🧴' },
];

function SparkleLogo({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* Big Star */}
      <svg viewBox="0 0 100 100" className="w-full h-full text-white fill-current">
        <path d="M50 0 L58 42 L100 50 L58 58 L50 100 L42 58 L0 50 L42 42 Z" />
      </svg>
      {/* Small Star Top-Right */}
      <svg viewBox="0 0 100 100" className="absolute -top-1 -right-1 w-1/3 h-1/3 text-white fill-current opacity-80">
        <path d="M50 0 L58 42 L100 50 L58 58 L50 100 L42 58 L0 50 L42 42 Z" />
      </svg>
      {/* Small Star Bottom-Left */}
      <svg viewBox="0 0 100 100" className="absolute -bottom-1 -left-1 w-1/3 h-1/3 text-white fill-current opacity-80">
        <path d="M50 0 L58 42 L100 50 L58 58 L50 100 L42 58 L0 50 L42 42 Z" />
      </svg>
    </div>
  );
}

function FlashSaleTimer() {
  const [timeLeft, setTimeLeft] = useState({ h: 2, m: 45, s: 12 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.s > 0) return { ...prev, s: prev.s - 1 };
        if (prev.m > 0) return { ...prev, m: 59, s: 59 };
        if (prev.h > 0) return { h: prev.h - 1, m: 59, s: 59 };
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex gap-2">
      {[timeLeft.h, timeLeft.m, timeLeft.s].map((unit, i) => (
        <div key={i} className="bg-white/20 px-2 py-1 rounded-lg text-white font-black text-sm min-w-[32px] text-center border border-white/10">
          {String(unit).padStart(2, '0')}
          <span className="text-[0.4rem] block uppercase tracking-tighter opacity-50">{['hrs', 'min', 'seg'][i]}</span>
        </div>
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-[1.5rem] border border-blue/5 overflow-hidden shadow-sm flex flex-col animate-skeleton">
      <div className="aspect-[4/5] bg-slate-pale" />
      <div className="p-5 flex-1 space-y-3">
        <div className="h-4 bg-slate-pale rounded w-3/4 mx-auto" />
        <div className="h-3 bg-slate-pale rounded w-1/2 mx-auto" />
        <div className="h-6 bg-slate-pale rounded w-2/3 mx-auto" />
        <div className="h-10 bg-slate-pale rounded-xl w-full" />
      </div>
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc'>('newest');
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('chelly_favorites');
    return saved ? JSON.parse(saved) : [];
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'address' | 'pix'>('cart');
  const [address, setAddress] = useState({ rua: '', numero: '', bairro: '', cidade: '' });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isMeAviseOpen, setIsMeAviseOpen] = useState(false);
  const [meAviseProduct, setMeAviseProduct] = useState<Product | null>(null);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState('');
  const [adminView, setAdminView] = useState<'produtos' | 'demandas'>('produtos');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [currentBanner, setCurrentBanner] = useState(0);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '', price: 0, stock: 10, category: 'make', description: ''
  });
  const [newProductImg, setNewProductImg] = useState('');
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false });
  const [qtyState, setQtyState] = useState<Record<string, number>>({});
  const [commentForm, setCommentForm] = useState({ user: '', text: '', stars: 5 });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lastSubmissionTime, setLastSubmissionTime] = useState(0);
  const [isGuardBotActive, setIsGuardBotActive] = useState(false);
  const [storeConfig, setStoreConfig] = useState({
    pix: FALLBACK_PIX,
    wpp: FALLBACK_WPP,
    name: "Chelly Shop",
    city: "Sao Paulo"
  });

  // Fetch Store Config with Obfuscated Paths
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const _0x1a = "\x73\x65\x74\x74\x69\x6e\x67\x73";
        const _0x2b = "\x63\x6f\x6e\x66\x69\x67";
        
        const docRef = doc(db, _0x1a, _0x2b);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.pix_key && data.whatsapp) {
            setStoreConfig({
              pix: data.pix_key.replace(/[<>]/g, "").trim(),
              wpp: data.whatsapp.replace(/\D/g, "").trim(),
              name: (data.store_name || "Chelly Shop").substring(0, 30),
              city: (data.store_city || "Sao Paulo").substring(0, 20)
            });
          }
        }
      } catch (e) { }
    };
    fetchConfig();
  }, []);

  // GuardBot Hook
  useGuardBot(() => setIsGuardBotActive(true));

  // Visibility API for Tab Title
  useEffect(() => {
    const originalTitle = "Chelly Shop ✨ | Cosméticos & Essências";
    const handleVisibilityChange = () => {
      if (document.hidden) {
        document.title = "Volta aqui! 💖";
      } else {
        document.title = originalTitle;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Scroll to Top Listener
  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch Products
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("createdAt", "asc"));
    
    // For normal users, we could use getDocs for efficiency, 
    // but onSnapshot is better for keeping the "magic" feel.
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ ...doc.data(), fid: doc.id } as Product));
      setProducts(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Fetch Demands for Admin
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "demands"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDemands(snap.docs.map(doc => ({ ...doc.data(), fid: doc.id } as Demand)));
    });
    return () => unsub();
  }, [isAdmin]);

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast({ msg: '', show: false }), 3000);
  };

  const addToCart = (product: Product, qty: number = 1) => {
    if (product.stock <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.fid === product.fid);
      const finalPrice = product.discountPrice || product.price;
      
      if (existing) {
        if (existing.quantity + qty > product.stock) {
          showToast('⚠️ Limite de estoque atingido!');
          return prev;
        }
        return prev.map(item => item.fid === product.fid ? { ...item, quantity: item.quantity + qty } : item);
      }
      
      showToast('✅ Adicionado à sacola!');
      return [...prev, { ...product, price: finalPrice, quantity: qty, cartId: Date.now() }];
    });
  };

  const updateCartQty = (cartId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        const newQty = Math.max(1, Math.min(item.stock, item.quantity + delta));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (cartId: number) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const handleWhatsAppOrder = () => {
    // Limpeza profunda e detecção de código de país
    let num = storeConfig.wpp.replace(/\D/g, "");
    if (num.length <= 11 && !num.startsWith("55")) num = "55" + num;

    // Construção profissional da mensagem com encoding correto
    const itemsList = cart.map(it => `• ${it.quantity}x ${it.name} (${fmt(it.price * it.quantity)})`).join('\n');
    const addressInfo = `\n\n*Endereço de Entrega:*\n${address.rua}, ${address.numero}\n${address.bairro} - ${address.cidade}`;
    const message = `Olá! Quero fechar meu pedido:\n\n${itemsList}\n\n*Total: ${fmt(cartTotal)}*${addressInfo}\n\nComo posso fazer o pagamento?`;
    
    const link = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
    window.location.assign(link);
  };

  const handleAdminAuth = async () => {
    if (isLockedOut) return showToast('⏳ Sistema bloqueado temporariamente');
    const pass = adminPassInput.trim();
    if (!pass) return showToast('⚠️ Digite a senha');

    try {
      // Obfuscated: settings / admin / MATport123
      const _0xc = "\x73\x65\x74\x74\x69\x6e\x67\x73";
      const _0x8 = "\x61\x64\x6d\x69\x6e";
      const _0xf = "\x4d\x41\x54\x70\x6f\x72\x74\x31\x32\x33";

      const adminRef = doc(db, _0xc, _0x8);
      const adminSnap = await getDoc(adminRef);
      
      let correctPass = _0xf;
      
      if (adminSnap.exists() && adminSnap.data().password) {
        correctPass = adminSnap.data().password;
      }

      if (pass === correctPass) {
        setIsAdmin(true);
        setIsAdminLoginOpen(false);
        setAdminPassInput('');
        setLoginAttempts(0);
        showToast('🔓 Acesso liberado');
      } else {
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        if (newAttempts >= 5) {
          setIsLockedOut(true);
          setTimeout(() => { setIsLockedOut(false); setLoginAttempts(0); }, 30000);
        }
        await new Promise(r => setTimeout(r, 1000));
        showToast(`❌ Senha incorreta (${newAttempts}/5)`);
        setAdminPassInput('');
      }
    } catch (e) {
      // Se falhar o Firebase por rede, ainda deixa usar a senha de emergência MATport123
      if (pass === "MATport123") {
        setIsAdmin(true);
        setIsAdminLoginOpen(false);
        setAdminPassInput('');
        showToast('🔓 Acesso de emergência liberado');
      } else {
        showToast('⚠️ Erro de conexão');
      }
    }
  };

  const handleSaveProduct = async () => {
    if (!newProduct.name || !newProduct.price) return showToast('⚠️ Preencha nome e preço');
    
    // Preparação segura dos dados para o Firestore
    // Removemos campos nulos ou indefinidos que quebram o Firebase
    const data: any = {
      name: newProduct.name,
      price: newProduct.price,
      discountPrice: newProduct.discountPrice || null,
      stock: newProduct.stock || 0,
      category: newProduct.category || 'make',
      description: newProduct.description || '',
      image: newProductImg || (editingProduct ? products.find(p => p.fid === editingProduct)?.image : ''),
    };

    try {
      if (editingProduct) {
        // Na edição, não sobrescrevemos data de criação, nota ou comentários
        await updateDoc(doc(db, 'products', editingProduct), data);
        showToast('✅ Produto atualizado');
      } else {
        // No cadastro novo, adicionamos os campos iniciais
        data.createdAt = serverTimestamp();
        data.rating = 5;
        data.comments = [];
        await addDoc(collection(db, 'products'), data);
        showToast('✅ Produto criado');
      }
      cancelEdit();
    } catch (e) {
      console.error("Erro ao salvar produto:", e);
      showToast('⚠️ Erro ao salvar. Tente novamente.');
    }
  };

  const cancelEdit = () => {
    setEditingProduct(null);
    setNewProduct({ name: '', price: 0, stock: 10, category: 'make', description: '' });
    setNewProductImg('');
  };

  const submitComment = async () => {
    // Throttling / Anti-Spam
    const now = Date.now();
    if (now - lastSubmissionTime < 5000) return showToast('⏳ Aguarde um pouco para comentar novamente');
    setLastSubmissionTime(now);

    const cleanUser = commentForm.user.replace(/[<>]/g, "").substring(0, 50);
    const cleanText = commentForm.text.replace(/[<>]/g, "").substring(0, 500);

    if (!selectedProduct || !cleanUser || !cleanText) return showToast('⚠️ Preencha nome e comentário!');
    
    const newComment = {
      id: Date.now(),
      user: cleanUser,
      text: cleanText,
      stars: commentForm.stars,
      date: today()
    };

    const updatedComments = [...(selectedProduct.comments || []), newComment];
    const avgRating = parseFloat((updatedComments.reduce((a, c) => a + c.stars, 0) / updatedComments.length).toFixed(1));

    try {
      await updateDoc(doc(db, 'products', selectedProduct.fid!), {
        comments: updatedComments,
        rating: avgRating
      });
      setCommentForm({ user: '', text: '', stars: 5 });
      showToast('✅ Avaliação publicada!');
      setSelectedProduct(prev => prev ? { ...prev, comments: updatedComments, rating: avgRating } : null);
    } catch (e) {
      showToast('⚠️ Erro ao publicar avaliação');
    }
  };

  const deleteProduct = async (fid: string) => {
    if (!confirm('Deseja realmente excluir?')) return;
    await deleteDoc(doc(db, 'products', fid));
    showToast('🗑️ Produto removido');
  };

  const toggleFavorite = (fid: string) => {
    setFavorites(prev => {
      const isFav = prev.includes(fid);
      const next = isFav ? prev.filter(id => id !== fid) : [...prev, fid];
      localStorage.setItem('chelly_favorites', JSON.stringify(next));
      showToast(isFav ? '💔 Removido dos favoritos' : '💖 Adicionado aos favoritos');
      return next;
    });
  };

  const shareProduct = async (product: Product) => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: `Confira esse produto na Chelly Shop: ${product.name}`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(`${window.location.href} - ${product.name}`);
        showToast('🔗 Link copiado!');
      }
    } catch (e) { console.warn(e); }
  };

  const featuredPerfumes = products
    .filter(p => p.category === 'perfumes' && (p.discountPrice || p.rating >= 4.8))
    .slice(0, 3);

  // Banner Auto-play
  useEffect(() => {
    if (featuredPerfumes.length === 0) return;
    const timer = setInterval(() => {
      setCurrentBanner(prev => (prev + 1) % featuredPerfumes.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [featuredPerfumes.length]);

  const filteredProducts = products
    .filter(p => {
      const matchesTab = activeTab === 'todos' || p.category === activeTab;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'price-asc') return (a.discountPrice || a.price) - (b.discountPrice || b.price);
      if (sortBy === 'price-desc') return (b.discountPrice || b.price) - (a.discountPrice || a.price);
      return 0; // 'newest' is default by Firestore query
    });

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-[9999]">
        <h1 className="text-4xl font-black italic gradient-text mb-6">Chelly Shop ✨</h1>
        <div className="w-48 h-1 bg-slate-pale rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-rose to-blue"
            animate={{ width: ["0%", "70%", "0%"], marginLeft: ["0%", "15%", "100%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <p className="mt-4 text-[0.6rem] uppercase tracking-[0.2em] font-bold text-slate-soft">Carregando magia...</p>
      </div>
    );
  }

  if (isGuardBotActive) return <GuardBotOverlay />;

  return (
    <div className="relative pb-20">
      {/* Toast */}
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 50, x: "-50%" }}
            className="fixed bottom-10 left-1/2 z-[1000] bg-slate text-white px-8 py-3 rounded-full font-bold shadow-2xl"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 h-[72px] bg-white border-b border-slate-pale z-50 flex items-center shadow-sm">
        <div className="max-w-7xl mx-auto w-full px-6 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setIsAdmin(false); setAdminView('produtos'); }}>
            <div className="w-10 h-10 bg-gradient-to-br from-rose to-blue rounded-xl flex items-center justify-center shadow-lg shadow-rose/20 p-2">
              <SparkleLogo className="w-full h-full" />
            </div>
            <span className="text-xl font-black italic gradient-text hidden sm:block">Chelly Shop</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => isAdmin ? setIsAdmin(false) : setIsAdminLoginOpen(true)}
              className={cn("p-2.5 rounded-xl border border-slate-pale bg-slate-pale text-slate-soft hover:bg-white hover:text-blue transition-all", isAdmin && "bg-slate text-white border-transparent")}
            >
              <Lock size={18} />
            </button>
            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-xl border-2 border-blue-light bg-white text-blue hover:scale-105 transition-all shadow-sm"
            >
              <ShoppingCart size={20} />
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-rose text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
                  {cart.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-28">
        {!isAdmin ? (
          <>
            {/* Shop View */}
            {/* High Impact Billboard (Promotion Screen) */}
            {featuredPerfumes.length > 0 && (
              <div className="relative h-[400px] md:h-[500px] mb-12 rounded-[2.5rem] overflow-hidden shadow-2xl group">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={featuredPerfumes[currentBanner].fid}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-slate via-slate/60 to-transparent z-10" />
                    <img 
                      src={featuredPerfumes[currentBanner].image} 
                      className="w-full h-full object-cover" 
                      alt={featuredPerfumes[currentBanner].name}
                    />
                    
                    <div className="absolute inset-0 z-20 flex flex-col justify-center px-10 md:px-20 max-w-2xl">
                      <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                      >
                        <div className="flex items-center gap-4 mb-6">
                          <span className="bg-rose text-white px-4 py-1.5 rounded-full text-[0.65rem] font-black uppercase tracking-[0.3em] inline-block italic shadow-lg shadow-rose/20">
                            🔥 Oferta Imperdível
                          </span>
                          <FlashSaleTimer />
                        </div>
                        <h2 className="text-4xl md:text-7xl font-black italic text-white leading-none mb-4 drop-shadow-2xl">
                          {featuredPerfumes[currentBanner].name}
                        </h2>
                        <div className="flex items-center gap-4 mb-8">
                          <div className="flex flex-col">
                            {featuredPerfumes[currentBanner].discountPrice && (
                              <span className="text-white/40 text-lg line-through font-bold">De: {fmt(featuredPerfumes[currentBanner].price)}</span>
                            )}
                            <span className="text-4xl md:text-5xl font-black italic text-white">
                              {featuredPerfumes[currentBanner].discountPrice ? 'Por: ' : ''}
                              {fmt(featuredPerfumes[currentBanner].discountPrice || featuredPerfumes[currentBanner].price)}
                            </span>
                          </div>
                          {featuredPerfumes[currentBanner].discountPrice && (
                            <div className="bg-white text-slate px-4 py-2 rounded-2xl font-black text-xl italic shadow-xl">
                              -{Math.round(((featuredPerfumes[currentBanner].price - featuredPerfumes[currentBanner].discountPrice) / featuredPerfumes[currentBanner].price) * 100)}%
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={() => setSelectedProduct(featuredPerfumes[currentBanner])}
                          className="bg-white text-slate px-10 py-5 rounded-2xl font-black uppercase text-[0.8rem] tracking-[0.2em] hover:bg-rose hover:text-white transition-all shadow-2xl active:scale-95"
                        >
                          Aproveitar Agora ✨
                        </button>
                      </motion.div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Progress Indicators */}
                <div className="absolute bottom-10 right-10 z-30 flex gap-2">
                  {featuredPerfumes.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentBanner(idx)}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-500",
                        currentBanner === idx ? "w-10 bg-white" : "w-4 bg-white/30"
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            <header className="relative bg-slate text-white rounded-[2rem] p-8 md:p-12 mb-10 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="relative z-10 text-center md:text-left">
                <span className="inline-block bg-blue/20 text-blue-light text-[0.6rem] font-black uppercase tracking-[0.25em] px-4 py-1.5 rounded-full border border-blue/20 mb-4 italic">
                  💎 Curadoria Chelly Shop
                </span>
                <h2 className="text-4xl md:text-6xl font-black italic leading-[1.1] mb-4">
                  Elegância em<br/><span className="text-blue">cada detalhe</span>
                </h2>
                <p className="text-white/50 text-sm max-w-sm">Sua jornada de beleza começa aqui com produtos exclusivos.</p>
                <div className="mt-6 flex items-center gap-2 text-rose-light text-[0.6rem] font-bold uppercase tracking-widest bg-rose/10 w-fit px-3 py-1.5 rounded-lg border border-rose/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  Entregas exclusivas em Rio Branco - AC
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 relative z-10">
                {[
                  { icon: '🌸', label: 'Perfumes' },
                  { icon: '✨', label: 'Skincare' },
                  { icon: '💆‍♀️', label: 'Cabelos' },
                  { icon: '🧴', label: 'Corpo' }
                ].map(cat => (
                  <div key={cat.label} className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm text-center">
                    <div className="text-2xl mb-1">{cat.icon}</div>
                    <span className="text-[0.6rem] font-bold uppercase tracking-wider text-white/70">{cat.label}</span>
                  </div>
                ))}
              </div>
              <div className="absolute top-[-60px] right-[-60px] w-80 h-80 bg-blue/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-[-80px] left-[30%] w-60 h-60 bg-rose/10 rounded-full blur-3xl pointer-events-none" />
            </header>

            {/* Search and Filters */}
            <div className="space-y-6 mb-10">
              <div className="relative group">
                <input 
                  type="text"
                  placeholder="O que você está procurando hoje? ✨"
                  maxLength={50}
                  className="w-full bg-white border-2 border-slate-pale rounded-3xl px-14 py-5 font-bold text-slate placeholder:text-slate-soft/50 outline-none focus:border-blue/30 transition-all shadow-sm group-hover:shadow-md"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.replace(/[<>]/g, ""))}
                />
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-soft">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </div>
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-soft hover:text-rose p-1"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide flex-1 w-full">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveTab(cat.id)}
                      className={cn(
                        "px-6 py-3 rounded-2xl border-2 border-slate-pale bg-white text-slate-soft font-black uppercase text-[0.65rem] tracking-widest transition-all whitespace-nowrap",
                        activeTab === cat.id && "bg-rose text-white border-rose shadow-lg shadow-rose/20"
                      )}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border-2 border-slate-pale w-full sm:w-auto">
                  <div className="pl-3 text-slate-soft"><ArrowUpDown size={14} /></div>
                  <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent font-black text-[0.6rem] uppercase tracking-widest text-slate-soft outline-none pr-4 py-2 cursor-pointer"
                  >
                    <option value="newest">Lançamentos</option>
                    <option value="price-asc">Menor Preço</option>
                    <option value="price-desc">Maior Preço</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Product Grid */}
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {[...Array(10)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {filteredProducts.map((p) => (
                  <ProductCard 
                    key={p.fid} 
                    product={p} 
                    isFavorite={favorites.includes(p.fid!)}
                    onToggleFavorite={() => toggleFavorite(p.fid!)}
                    onDetail={() => setSelectedProduct(p)} 
                    onAdd={(qty) => addToCart(p, qty)}
                    onNotify={() => { setMeAviseProduct(p); setIsMeAviseOpen(true); }}
                  />
                ))}
              </div>
            ) : (
              <div className="py-20 text-center animate-fade-up">
                <div className="text-6xl mb-6 opacity-20">🔍</div>
                <h3 className="text-2xl font-black italic text-slate mb-2">Nenhum brilho encontrado</h3>
                <p className="text-slate-soft text-sm italic">Tente mudar sua busca ou filtro para encontrar o que deseja.</p>
                <button 
                  onClick={() => { setSearchQuery(''); setActiveTab('todos'); }}
                  className="mt-8 px-8 py-3 bg-slate-pale text-slate-soft rounded-2xl font-black uppercase text-[0.6rem] tracking-widest hover:bg-slate hover:text-white transition-all"
                >
                  Limpar todos os filtros
                </button>
              </div>
            )}

            {/* Contact Support Section */}
            <section className="mt-24 bg-white border border-slate-pale rounded-[3rem] p-10 md:p-16 text-center shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <span className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-blue italic mb-4 block">Central de Atendimento</span>
                <h3 className="text-3xl md:text-5xl font-black italic text-slate mb-6">Precisa de ajuda com<br/>seu pedido?</h3>
                <p className="text-slate-soft text-sm max-w-lg mx-auto mb-10 italic">Estamos disponíveis para tirar suas dúvidas sobre produtos, prazos de entrega ou pagamentos.</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <a 
                    href={`https://wa.me/${storeConfig.wpp.replace(/\D/g, '')}`} 
                    target="_blank"
                    className="btn-primary flex items-center gap-3 px-10 py-5 text-[0.8rem]"
                  >
                    <Phone size={18} /> Chamar no WhatsApp
                  </a>
                  <a 
                    href="#" 
                    className="px-10 py-5 rounded-2xl border-2 border-slate-pale text-slate-soft font-black uppercase text-[0.7rem] tracking-widest hover:bg-slate-pale transition-all flex items-center gap-3"
                  >
                    <Star size={18} /> Seguir no Instagram
                  </a>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-light/20 blur-[100px] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-light/20 blur-[100px] pointer-events-none" />
            </section>
            
            <footer className="mt-20 text-center pb-10">
              <div className="flex items-center justify-center gap-3 mb-4 grayscale opacity-30">
                <div className="w-6 h-6 bg-slate rounded-lg flex items-center justify-center p-1.5">
                  <SparkleLogo className="w-full h-full" />
                </div>
                <span className="font-black italic text-slate text-sm">Chelly Shop</span>
              </div>
              <p className="text-[0.6rem] font-bold text-slate-soft/50 uppercase tracking-[0.2em]">© 2024 Chelly Shop — Todos os direitos reservados</p>
            </footer>
          </>
        ) : (
          /* Admin View */
          <div className="animate-fade-up">
            {/* Admin Header Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white p-6 rounded-[2rem] border border-slate-pale shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-light text-blue rounded-2xl flex items-center justify-center"><Package size={20} /></div>
                  <div>
                    <p className="text-[0.6rem] font-black uppercase text-slate-soft tracking-widest italic">Total Produtos</p>
                    <h4 className="text-2xl font-black italic text-slate">{products.length}</h4>
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-pale shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center"><AlertCircle size={20} /></div>
                  <div>
                    <p className="text-[0.6rem] font-black uppercase text-slate-soft tracking-widest italic">Estoque Baixo</p>
                    <h4 className="text-2xl font-black italic text-slate">{products.filter(p => p.stock > 0 && p.stock <= 3).length}</h4>
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-pale shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-rose-50 text-rose-dark rounded-2xl flex items-center justify-center"><X size={20} /></div>
                  <div>
                    <p className="text-[0.6rem] font-black uppercase text-slate-soft tracking-widest italic">Esgotados</p>
                    <h4 className="text-2xl font-black italic text-slate">{products.filter(p => p.stock <= 0).length}</h4>
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-pale shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-50 text-green-700 rounded-2xl flex items-center justify-center"><TrendingUp size={20} /></div>
                  <div>
                    <p className="text-[0.6rem] font-black uppercase text-slate-soft tracking-widest italic">Interessados</p>
                    <h4 className="text-2xl font-black italic text-slate">{demands.length}</h4>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <div className="flex gap-3">
                <button 
                  onClick={() => setAdminView('produtos')}
                  className={cn("px-6 py-2.5 rounded-xl font-black uppercase text-[0.7rem] tracking-widest transition-all flex items-center gap-2", adminView === 'produtos' ? "bg-blue text-white shadow-lg shadow-blue/20" : "bg-white text-slate-soft")}
                >
                  <Package size={16} /> Produtos
                </button>
                <button 
                  onClick={() => setAdminView('demandas')}
                  className={cn("relative px-6 py-2.5 rounded-xl font-black uppercase text-[0.7rem] tracking-widest transition-all flex items-center gap-2", adminView === 'demandas' ? "bg-rose text-white shadow-lg shadow-rose/20" : "bg-white text-slate-soft")}
                >
                  <Bell size={16} /> Solicitações
                  {demands.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-slate text-white text-[9px] w-5 h-5 rounded-full flex items-center justify-center font-black">
                      {demands.length}
                    </span>
                  )}
                </button>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-black italic text-slate">Painel Administrativo</h2>
                <p className="text-[0.65rem] font-bold text-slate-soft uppercase tracking-wider">Modo em tempo real ativo 🔥</p>
              </div>
            </div>

            {adminView === 'produtos' ? (
              <div className="grid grid-cols-1 lg:grid-cols-[440px,1fr] gap-8">
                {/* Product Form */}
                <div className="bg-white p-8 rounded-[2rem] border border-slate-pale shadow-sm h-fit">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-soft mb-6 italic">{editingProduct ? '✏️ Editando Produto' : '📦 Novo Item'}</h3>
                  <div className="space-y-4">
                    <input 
                      className="input-style" 
                      placeholder="Nome do Produto" 
                      maxLength={60}
                      value={newProduct.name}
                      onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="number" 
                        className="input-style" 
                        placeholder="Preço R$" 
                        max={99999}
                        value={newProduct.price || ''}
                        onChange={e => setNewProduct(prev => ({ ...prev, price: Math.abs(parseFloat(e.target.value)) }))}
                      />
                      <input 
                        type="number" 
                        className="input-style" 
                        placeholder="Promoção R$" 
                        max={99999}
                        value={newProduct.discountPrice || ''}
                        onChange={e => setNewProduct(prev => ({ ...prev, discountPrice: e.target.value ? Math.abs(parseFloat(e.target.value)) : null }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="number" 
                        className="input-style" 
                        placeholder="Estoque" 
                        value={newProduct.stock || ''}
                        onChange={e => setNewProduct(prev => ({ ...prev, stock: parseInt(e.target.value) }))}
                      />
                      <select 
                        className="input-style"
                        value={newProduct.category}
                        onChange={e => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
                      >
                        {CATEGORIES.slice(1).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                    <textarea 
                      className="input-style h-24 resize-none" 
                      placeholder="Descrição do produto..."
                      value={newProduct.description}
                      onChange={e => setNewProduct(prev => ({ ...prev, description: e.target.value }))}
                    />
                    <div 
                      onClick={() => document.getElementById('file-up')?.click()}
                      className="aspect-video bg-slate-pale border-2 border-dashed border-slate-soft/20 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden hover:border-blue transition-colors"
                    >
                      {newProductImg || (editingProduct && products.find(p => p.fid === editingProduct)?.image) ? (
                        <img src={newProductImg || products.find(p => p.fid === editingProduct)?.image} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center text-slate-soft">
                          <Camera className="mx-auto mb-2" />
                          <span className="text-[0.6rem] font-bold uppercase tracking-widest">Carregar Foto</span>
                        </div>
                      )}
                    </div>
                    <input 
                      id="file-up" 
                      type="file" 
                      hidden 
                      accept="image/*" 
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const compressed = await compressImage(file);
                          setNewProductImg(compressed);
                        }
                      }}
                    />
                    <button onClick={handleSaveProduct} className="btn-primary w-full py-4 text-[0.8rem] flex items-center justify-center gap-2">
                      <Check size={18} /> {editingProduct ? 'Atualizar Produto' : 'Salvar Produto'}
                    </button>
                    {editingProduct && (
                      <button onClick={cancelEdit} className="w-full text-center text-slate-soft font-bold text-[0.65rem] uppercase tracking-widest mt-2">
                        Cancelar Edição
                      </button>
                    )}
                  </div>
                </div>

                {/* Product List */}
                <div className="bg-white rounded-[2rem] border border-slate-pale shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-pale">
                    <div className="relative group">
                      <input 
                        type="text" 
                        placeholder="Buscar produto no painel..." 
                        className="w-full bg-slate-pale rounded-xl px-12 py-3 text-sm font-bold placeholder:text-slate-soft/50 outline-none border border-transparent focus:border-blue/20"
                        value={adminSearchQuery}
                        onChange={e => setAdminSearchQuery(e.target.value)}
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-soft"><Search size={18} /></div>
                    </div>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-pale text-slate-soft text-[0.65rem] font-black uppercase tracking-[0.2em] italic border-b border-slate-soft/10">
                      <tr>
                        <th className="px-6 py-4">Produto</th>
                        <th className="px-6 py-4">Estoque</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-pale">
                      {products
                        .filter(p => p.name.toLowerCase().includes(adminSearchQuery.toLowerCase()))
                        .map(p => (
                        <tr key={p.fid} className="hover:bg-slate-pale/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <img src={p.image} className="w-12 h-12 rounded-xl object-cover shadow-sm" />
                              <div>
                                <h4 className="font-black italic text-slate text-sm">{p.name}</h4>
                                <span className="text-blue font-black text-xs italic">{fmt(p.discountPrice || p.price)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "text-[0.6rem] font-black uppercase tracking-widest px-3 py-1 rounded-full border",
                              p.stock > 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-rose-50 text-rose-700 border-rose-200"
                            )}>
                              {p.stock} un.
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => {
                                  setEditingProduct(p.fid!);
                                  setNewProduct({ ...p });
                                  setNewProductImg('');
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="p-2 text-slate-soft hover:text-blue transition-colors"
                              >
                                <Edit3 size={18} />
                              </button>
                              <button onClick={() => deleteProduct(p.fid!)} className="p-2 text-slate-soft hover:text-rose transition-colors">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Demands List */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {demands.length === 0 ? (
                  <div className="col-span-full py-20 text-center bg-white rounded-[2rem] border border-slate-pale">
                    <div className="text-6xl mb-6 opacity-20">📭</div>
                    <h3 className="text-2xl font-black italic text-slate">Tudo limpo por aqui!</h3>
                    <p className="text-slate-soft text-sm italic">Nenhuma solicitação de aviso de estoque pendente.</p>
                  </div>
                ) : demands.map(d => (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={d.fid} className="bg-white p-6 rounded-[2rem] border border-slate-pale shadow-sm relative group">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[0.6rem] font-black text-rose uppercase tracking-widest italic block">Solicitado em {d.date}</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            if(confirm('Arquivar esta solicitação?')) {
                              await deleteDoc(doc(db, 'demands', d.fid!));
                              showToast('📦 Arquivado com sucesso');
                            }
                          }}
                          className="p-2 bg-slate-pale text-slate-soft hover:bg-blue-light hover:text-blue rounded-xl transition-all"
                          title="Arquivar"
                        >
                          <Archive size={14} />
                        </button>
                        <button 
                          onClick={async () => {
                            if(confirm('Excluir permanentemente?')) {
                              await deleteDoc(doc(db, 'demands', d.fid!));
                              showToast('🗑️ Removido');
                            }
                          }}
                          className="p-2 bg-slate-pale text-slate-soft hover:bg-rose-light hover:text-rose rounded-xl transition-all"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <h4 className="text-lg font-black italic text-slate uppercase mb-4">{d.product}</h4>
                    <div className="space-y-2 mb-6 p-4 bg-slate-pale rounded-2xl">
                      <div className="flex items-center gap-2 text-slate-mid text-sm font-bold"><span>👤</span> {d.user}</div>
                      <div className="flex items-center gap-2 text-slate-mid text-sm font-bold"><span>📱</span> {d.whatsapp}</div>
                    </div>
                    <a 
                      href={`https://wa.me/${d.whatsapp.replace(/\D/g,'')}`}
                      target="_blank"
                      className="w-full py-3 bg-green-500 text-white rounded-xl font-black uppercase text-[0.7rem] tracking-widest flex items-center justify-center gap-2 hover:bg-green-600 transition-colors shadow-lg shadow-green-500/20"
                    >
                      <Phone size={14} /> Contactar Cliente
                    </a>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Cart Sidebar */}
      <AnimatePresence>
        {isCartOpen && (
          <div className="fixed inset-0 z-[100] pointer-events-none">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="absolute inset-0 bg-slate/60 backdrop-blur-sm pointer-events-auto"
            />
            <motion.div 
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl pointer-events-auto flex flex-col"
            >
              <div className="p-6 border-b border-slate-pale flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-light text-blue rounded-xl flex items-center justify-center text-xl">
                    {checkoutStep === 'cart' ? '🛍️' : checkoutStep === 'address' ? '📍' : '💳'}
                  </div>
                  <h3 className="text-xl font-black italic text-slate">
                    {checkoutStep === 'cart' ? 'Sua Sacola' : checkoutStep === 'address' ? 'Entrega' : 'Pagamento'}
                  </h3>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="p-2 text-slate-soft hover:text-rose transition-colors">
                  <X size={24} />
                </button>
              </div>

              {/* Steps */}
              <div className="px-6 py-4 flex gap-2">
                {['cart', 'address', 'pix'].map((s, i) => (
                  <div key={s} className={cn(
                    "h-1 flex-1 rounded-full bg-slate-pale transition-colors",
                    (['cart', 'address', 'pix'].indexOf(checkoutStep) > i) && "bg-blue",
                    checkoutStep === s && "bg-rose"
                  )} />
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {checkoutStep === 'cart' && (
                  <div className="space-y-6">
                    {cart.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-soft opacity-30 mt-20">
                        <ShoppingCart size={64} strokeWidth={1} className="mb-4" />
                        <p className="text-sm font-black uppercase tracking-widest italic">Sua sacola está vazia</p>
                      </div>
                    ) : (
                      cart.map(item => (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key={item.cartId} className="flex gap-4">
                          <img src={item.image} className="w-20 h-20 rounded-2xl object-cover border border-slate-pale" />
                          <div className="flex-1">
                            <h4 className="text-xs font-black uppercase text-slate italic leading-tight mb-1">{item.name}</h4>
                            <div className="text-blue font-black italic mb-2">{fmt(item.price)}</div>
                            <div className="flex items-center gap-3">
                              <button onClick={() => updateCartQty(item.cartId, -1)} className="w-8 h-8 rounded-lg border border-slate-pale flex items-center justify-center text-slate hover:bg-slate hover:text-white transition-all">
                                <Minus size={14} />
                              </button>
                              <span className="font-black text-sm w-4 text-center">{item.quantity}</span>
                              <button onClick={() => updateCartQty(item.cartId, 1)} className="w-8 h-8 rounded-lg border border-slate-pale flex items-center justify-center text-slate hover:bg-slate hover:text-white transition-all">
                                <Plus size={14} />
                              </button>
                            </div>
                          </div>
                          <button onClick={() => removeFromCart(item.cartId)} className="p-2 text-slate-soft/30 hover:text-rose transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </motion.div>
                      ))
                    )}
                  </div>
                )}

                {checkoutStep === 'address' && (
                  <div className="space-y-6 animate-fade-up">
                    <div>
                      <label className="text-[0.6rem] font-black uppercase tracking-widest text-slate-soft block mb-1.5 italic">Rua / Logradouro</label>
                      <input className="input-style" placeholder="Ex: Av. Brasil" value={address.rua} onChange={e => setAddress(p => ({ ...p, rua: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[0.6rem] font-black uppercase tracking-widest text-slate-soft block mb-1.5 italic">Número</label>
                        <input className="input-style" placeholder="123" value={address.numero} onChange={e => setAddress(p => ({ ...p, numero: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-[0.6rem] font-black uppercase tracking-widest text-slate-soft block mb-1.5 italic">Bairro</label>
                        <input className="input-style" placeholder="Centro" value={address.bairro} onChange={e => setAddress(p => ({ ...p, bairro: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[0.6rem] font-black uppercase tracking-widest text-slate-soft block mb-1.5 italic">Cidade</label>
                      <input className="input-style bg-slate-pale/50 cursor-not-allowed" value="Rio Branco - AC" disabled />
                      <p className="text-[0.5rem] font-bold text-rose mt-1 uppercase tracking-tighter italic">* Entregamos exclusivamente em Rio Branco.</p>
                    </div>
                    <div className="p-4 bg-blue-light/50 border border-blue-light text-blue-dark text-xs font-bold rounded-2xl flex gap-3 italic leading-relaxed">
                      <span>🚚</span>
                      Certifique-se de que o endereço está correto para que seu brilho chegue sem atrasos!
                    </div>
                  </div>
                )}



                {checkoutStep === 'pix' && (
                  <div className="space-y-6 animate-fade-up">
                    <div className="bg-white p-5 rounded-[2rem] border border-slate-pale">
                       <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-soft mb-3 italic">Resumo do Pedido</p>
                       <div className="max-h-32 overflow-y-auto space-y-2 mb-2 pr-2 scrollbar-hide">
                         {cart.map(it => (
                           <div key={it.cartId} className="flex justify-between text-[0.65rem] border-b border-slate-pale pb-1 last:border-0">
                             <span className="text-slate-mid font-bold line-clamp-1 flex-1 mr-4">{it.quantity}x {it.name}</span>
                             <span className="font-black text-slate">{fmt(it.price * it.quantity)}</span>
                           </div>
                         ))}
                       </div>
                       <div className="pt-2 border-t-2 border-slate-pale flex justify-between">
                         <span className="text-[0.7rem] font-black uppercase text-slate">Total Geral</span>
                         <span className="font-black text-blue">{fmt(cartTotal)}</span>
                       </div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-light to-blue-light/50 border border-blue-light p-8 rounded-[2rem] text-center">
                      <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-blue/60 mb-2">Total a pagar</p>
                      <div className="text-4xl font-black italic text-blue-dark">{fmt(cartTotal)}</div>
                    </div>
                    <div className="flex justify-center bg-white p-4 rounded-[2rem] border border-slate-pale shadow-inner">
                      <QRCodeSVG 
                        value={generatePixPayload(storeConfig.pix, cartTotal, storeConfig.name, storeConfig.city)}
                        size={220}
                        level="H"
                        includeMargin
                      />
                    </div>
                    <div className="bg-slate-pale p-6 rounded-[2rem] border border-slate-soft/10">
                      <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-soft text-center mb-3 italic">Chave Pix</p>
                      <div className="bg-white px-5 py-3.5 rounded-2xl border border-slate-pale flex items-center justify-between gap-4">
                        <span className="font-bold text-slate-mid">{storeConfig.pix}</span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(storeConfig.pix);
                            showToast('✅ Chave copiada!');
                          }}
                          className="text-blue hover:scale-125 transition-transform"
                        >
                          <Copy size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold rounded-2xl flex gap-3 italic leading-relaxed">
                      <span>⏰</span>
                      Após o pagamento, envie o comprovante pelo WhatsApp para agilizarmos seu pedido!
                    </div>
                    
                    <button 
                      onClick={handleWhatsAppOrder}
                      className="w-full py-4 bg-green-500 text-white rounded-2xl font-black uppercase text-[0.7rem] tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-green-500/20 hover:bg-green-600 transition-all"
                    >
                      <Phone size={18} /> Enviar Pedido via WhatsApp
                    </button>
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-8 bg-slate-pale/80 border-t border-slate-pale rounded-t-[3rem] shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
                  {checkoutStep === 'cart' && (
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-[0.7rem] font-black uppercase tracking-widest text-slate-soft italic">Subtotal</span>
                      <span className="text-2xl font-black italic text-slate">{fmt(cartTotal)}</span>
                    </div>
                  )}
                  <button 
                    onClick={() => {
                      if (checkoutStep === 'cart') setCheckoutStep('address');
                      else if (checkoutStep === 'address') {
                        if (!address.rua || !address.numero || !address.cidade) return showToast('⚠️ Preencha o endereço!');
                        setCheckoutStep('pix');
                      } else {
                        showToast('🎉 Pedido confirmado!');
                        setIsCartOpen(false);
                        setCart([]);
                        setCheckoutStep('cart');
                        setAddress({ rua: '', numero: '', bairro: '', cidade: '' });
                      }
                    }}
                    className="btn-primary w-full py-4 text-[0.8rem] flex items-center justify-center gap-2"
                  >
                    {checkoutStep === 'cart' ? 'Próximo Passo' : checkoutStep === 'address' ? 'Ir para Pagamento' : '✅ Finalizar Pedido'}
                    {(checkoutStep === 'cart' || checkoutStep === 'address') && <ChevronRight size={18} />}
                  </button>
                  {checkoutStep !== 'cart' && (
                    <button 
                      onClick={() => {
                        if (checkoutStep === 'address') setCheckoutStep('cart');
                        if (checkoutStep === 'pix') setCheckoutStep('address');
                      }}
                      className="w-full text-center text-slate-soft font-bold text-[0.65rem] uppercase tracking-widest mt-4"
                    >
                      Voltar
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Detail Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedProduct(null)} className="absolute inset-0 bg-slate/90 backdrop-blur-md" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row"
            >
              <button onClick={() => setSelectedProduct(null)} className="absolute top-6 right-6 z-10 w-11 h-11 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg text-slate-soft hover:text-rose hover:scale-110 transition-all">
                <X size={20} />
              </button>
              
              <div className="md:w-[45%] h-[300px] md:h-auto relative bg-slate-pale overflow-hidden">
                <img src={selectedProduct.image} className="w-full h-full object-cover" />
                <div className="hidden sm:block absolute bottom-6 left-6 bg-white/95 backdrop-blur-xl p-5 rounded-[2rem] shadow-2xl">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map(i => <Star key={i} size={14} fill={i <= Math.round(selectedProduct.rating) ? "#facc15" : "none"} color={i <= Math.round(selectedProduct.rating) ? "#facc15" : "#e2e8f0"} />)}
                  </div>
                  <p className="text-[0.6rem] font-black text-slate-soft uppercase tracking-widest italic">{selectedProduct.comments?.length || 0} Avaliações de clientes</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 md:p-14">
                <div className="mb-10">
                  <span className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-blue italic mb-3 block">
                    {CATEGORIES.find(c => c.id === selectedProduct.category)?.label}
                  </span>
                  <h2 className="text-4xl md:text-5xl font-black italic text-slate leading-none mb-4">{selectedProduct.name}</h2>
                  <div className="flex items-baseline gap-4 mb-6">
                    {selectedProduct.discountPrice && (
                      <span className="text-xl font-black text-slate-soft line-through">{fmt(selectedProduct.price)}</span>
                    )}
                    <span className="text-4xl font-black italic text-rose">{fmt(selectedProduct.discountPrice || selectedProduct.price)}</span>
                  </div>

                  <div className="flex gap-2 mb-6">
                    <button 
                      onClick={() => toggleFavorite(selectedProduct.fid!)}
                      className={cn(
                        "flex-1 py-3 rounded-2xl border-2 font-black uppercase text-[0.65rem] tracking-widest flex items-center justify-center gap-2 transition-all",
                        favorites.includes(selectedProduct.fid!) ? "bg-rose border-rose text-white shadow-lg shadow-rose/20" : "bg-white border-slate-pale text-slate-soft"
                      )}
                    >
                      <Heart size={14} fill={favorites.includes(selectedProduct.fid!) ? "currentColor" : "none"} />
                      {favorites.includes(selectedProduct.fid!) ? 'Favoritado' : 'Favoritar'}
                    </button>
                    <button 
                      onClick={() => shareProduct(selectedProduct)}
                      className="px-6 py-3 rounded-2xl border-2 border-slate-pale bg-white text-slate-soft hover:bg-slate-pale transition-all"
                    >
                      <Share2 size={16} />
                    </button>
                  </div>

                  {selectedProduct.description && (
                    <div className="bg-slate-pale p-6 rounded-3xl text-sm leading-relaxed text-slate-mid italic mb-8 border border-slate-pale">
                      {selectedProduct.description}
                    </div>
                  )}

                  {selectedProduct.stock > 0 ? (
                    <div className="space-y-6">
                      <div className="flex items-center gap-6">
                        <span className="text-[0.65rem] font-black uppercase tracking-widest text-slate-soft">Quantidade</span>
                        <div className="flex items-center gap-5">
                          <button 
                            onClick={() => setQtyState(p => ({ ...p, [selectedProduct.fid!]: Math.max(1, (p[selectedProduct.fid!] || 1) - 1) }))}
                            className="w-10 h-10 rounded-xl border-2 border-slate-pale flex items-center justify-center text-slate hover:bg-slate hover:text-white transition-all"
                          >
                            <Minus size={18} />
                          </button>
                          <span className="text-xl font-black w-6 text-center">{qtyState[selectedProduct.fid!] || 1}</span>
                          <button 
                            onClick={() => setQtyState(p => ({ ...p, [selectedProduct.fid!]: Math.min(selectedProduct.stock, (p[selectedProduct.fid!] || 1) + 1) }))}
                            className="w-10 h-10 rounded-xl border-2 border-slate-pale flex items-center justify-center text-slate hover:bg-slate hover:text-white transition-all"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                        <span className="text-[0.65rem] font-bold text-slate-soft">máx. {selectedProduct.stock}</span>
                      </div>
                      <button 
                        onClick={() => {
                          addToCart(selectedProduct, qtyState[selectedProduct.fid!] || 1);
                          setSelectedProduct(null);
                        }}
                        className="btn-primary w-full py-5 text-[0.85rem] rounded-[1.5rem]"
                      >
                        + Adicionar à Sacola
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl text-rose-dark text-sm font-bold italic leading-relaxed">
                        🌸 Esse produto está esgotado, mas logo logo teremos mais! Quer ser avisada?
                      </div>
                      <button 
                        onClick={() => { setSelectedProduct(null); setMeAviseProduct(selectedProduct); setIsMeAviseOpen(true); }}
                        className="w-full py-5 bg-rose text-white rounded-[1.5rem] font-black uppercase text-[0.8rem] tracking-widest shadow-xl shadow-rose/20"
                      >
                        🔔 Me Avise quando chegar
                      </button>
                    </div>
                  )}
                </div>

                {/* Reviews */}
                <div className="border-t-2 border-slate-pale pt-10">
                  <h3 className="text-xl font-black italic text-slate mb-8 flex items-center gap-3">Feedbacks 💬</h3>

                  {/* Review Summary Distribution */}
                  <div className="bg-slate-pale/50 p-6 rounded-[2rem] border border-slate-pale mb-10 flex flex-col sm:flex-row gap-8 items-center">
                    <div className="text-center">
                      <div className="text-5xl font-black italic text-slate mb-1">{selectedProduct.rating || 5}</div>
                      <div className="flex justify-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map(i => <Star key={i} size={14} fill={i <= Math.round(selectedProduct.rating || 5) ? "#facc15" : "none"} color={i <= Math.round(selectedProduct.rating || 5) ? "#facc15" : "#e2e8f0"} />)}
                      </div>
                      <div className="text-[0.6rem] font-black text-slate-soft uppercase tracking-widest">{selectedProduct.comments?.length || 0} Avaliações</div>
                    </div>
                    <div className="flex-1 w-full space-y-2">
                      {[5, 4, 3, 2, 1].map(star => {
                        const count = selectedProduct.comments?.filter(c => c.stars === star).length || 0;
                        const percent = selectedProduct.comments?.length ? (count / selectedProduct.comments.length) * 100 : (star === 5 ? 100 : 0);
                        return (
                          <div key={star} className="flex items-center gap-3">
                            <span className="text-[0.6rem] font-black text-slate-soft w-4">{star}★</span>
                            <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden border border-slate-pale">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} className="h-full bg-amber-400" />
                            </div>
                            <span className="text-[0.6rem] font-bold text-slate-soft/50 w-6">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Review Form */}
                  <div className="bg-slate-pale p-6 rounded-[2rem] border border-slate-pale mb-10">
                    <div className="flex flex-col sm:flex-row gap-4 mb-4">
                      <input 
                        className="input-style flex-1" 
                        placeholder="Seu Nome" 
                        value={commentForm.user}
                        onChange={e => setCommentForm(p => ({ ...p, user: e.target.value }))}
                      />
                      <div className="bg-white border-2 border-slate-pale px-4 py-3 rounded-2xl flex items-center gap-3">
                        <Star size={14} fill="#facc15" color="#facc15" />
                        <select 
                          className="bg-transparent font-black text-xs outline-none"
                          value={commentForm.stars}
                          onChange={e => setCommentForm(p => ({ ...p, stars: parseInt(e.target.value) }))}
                        >
                          {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} estrelas</option>)}
                        </select>
                      </div>
                    </div>
                    <textarea 
                      className="input-style h-24 resize-none mb-4" 
                      placeholder="O que achou deste produto?"
                      value={commentForm.text}
                      onChange={e => setCommentForm(p => ({ ...p, text: e.target.value }))}
                    />
                    <button 
                      onClick={submitComment}
                      className="w-full py-3.5 bg-blue text-white rounded-2xl font-black uppercase text-[0.7rem] tracking-widest shadow-lg shadow-blue/20 hover:bg-slate transition-all"
                    >
                      Publicar Avaliação
                    </button>
                  </div>

                  <div className="space-y-8">
                    {selectedProduct.comments?.length === 0 ? (
                      <p className="text-center text-slate-soft italic text-sm py-4">Seja o primeiro a avaliar!</p>
                    ) : (
                      selectedProduct.comments?.map(c => (
                        <div key={c.id} className="border-b-2 border-slate-pale pb-6 last:border-0">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[0.7rem] font-black uppercase italic text-slate">{c.user}</span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(i => <Star key={i} size={10} fill={i <= c.stars ? "#facc15" : "none"} color={i <= c.stars ? "#facc15" : "#e2e8f0"} />)}
                            </div>
                          </div>
                          <p className="text-slate-mid text-sm italic leading-relaxed">"{c.text}"</p>
                          <span className="text-[0.6rem] font-black text-slate-soft/40 bg-slate-soft/5 px-2 py-0.5 rounded uppercase mt-3 inline-block font-body not-italic">{c.date}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Related Products */}
                <div className="border-t-2 border-slate-pale pt-10 mt-10">
                  <h3 className="text-xl font-black italic text-slate mb-8 flex items-center gap-3">Você também pode gostar ✨</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {products
                      .filter(p => p.category === selectedProduct.category && p.fid !== selectedProduct.fid)
                      .slice(0, 3)
                      .map(p => (
                        <div key={p.fid} onClick={() => setSelectedProduct(p)} className="cursor-pointer group">
                          <div className="aspect-square rounded-2xl overflow-hidden bg-slate-pale mb-3">
                            <img src={p.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                          </div>
                          <h4 className="text-[0.65rem] font-black uppercase text-slate italic line-clamp-1">{p.name}</h4>
                          <span className="text-blue font-black italic text-xs">{fmt(p.discountPrice || p.price)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Me Avise Modal */}
      <AnimatePresence>
        {isMeAviseOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMeAviseOpen(false)} className="absolute inset-0 bg-slate/90 backdrop-blur-md" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white p-10 rounded-[2.5rem] shadow-2xl text-center"
            >
              <button onClick={() => setIsMeAviseOpen(false)} className="absolute top-6 right-6 text-slate-soft hover:text-rose transition-colors">
                <X size={20} />
              </button>
              <div className="w-20 h-20 bg-rose-light text-rose rounded-3xl flex items-center justify-center text-3xl mx-auto mb-6 shadow-lg shadow-rose/10">🔔</div>
              <h3 className="text-3xl font-black italic text-slate mb-2">Me Avise!</h3>
              <p className="text-[0.7rem] font-bold text-slate-soft uppercase tracking-widest leading-relaxed mb-8">
                O item <span className="text-rose italic">{meAviseProduct?.name}</span> está esgotado. Deixe seu contato:
              </p>
              <div className="space-y-3">
                <input id="me-nome" className="input-style" placeholder="Seu Nome" />
                <input id="me-wpp" className="input-style" placeholder="Seu WhatsApp" />
                    <button 
                      onClick={async () => {
                        const now = Date.now();
                        if (now - lastSubmissionTime < 10000) return showToast('⏳ Sistema processando, aguarde...');
                        setLastSubmissionTime(now);

                        const nomeRaw = (document.getElementById('me-nome') as HTMLInputElement).value;
                        const wppRaw = (document.getElementById('me-wpp') as HTMLInputElement).value;
                        
                        // Validação robusta
                        const nome = nomeRaw.trim().replace(/[<>]/g, "").substring(0, 40);
                        const wpp = wppRaw.replace(/\D/g, "").substring(0, 11); // Padrão celular BR

                        if (nome.length < 3 || wpp.length < 10) return showToast('⚠️ Nome ou WhatsApp inválido!');
                        
                        await addDoc(collection(db, 'demands'), {
                          product: meAviseProduct?.name,
                          productId: meAviseProduct?.fid,
                          user: nome,
                          whatsapp: wpp,
                          date: today(),
                          createdAt: serverTimestamp()
                        });
                        setIsMeAviseOpen(false);
                        showToast('✅ Solicitação registrada!');
                      }}
                      className="btn-primary w-full py-4 text-[0.8rem] flex items-center justify-center gap-2 mt-4"
                    >
                  <Send size={16} /> Enviar Solicitação
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Login Modal (Simple) */}
      <AnimatePresence>
        {isAdminLoginOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAdminLoginOpen(false)} className="absolute inset-0 bg-slate/90 backdrop-blur-md" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white p-12 rounded-[2.5rem] shadow-2xl text-center"
            >
              <div className="text-4xl mb-6">🔐</div>
              <h3 className="text-2xl font-black italic text-slate mb-8">Acesso Administrativo</h3>
              <div className="space-y-4">
                <input 
                  type="password" 
                  className="input-style text-center" 
                  placeholder="DIGITE SUA SENHA" 
                  autoFocus
                  value={adminPassInput}
                  onChange={e => setAdminPassInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdminAuth()}
                />
              </div>
              <button onClick={handleAdminAuth} className="btn-primary w-full py-4 text-[0.8rem] mt-6">
                Acessar Painel
              </button>
              <button onClick={() => setIsAdminLoginOpen(false)} className="w-full text-center text-slate-soft font-bold text-[0.65rem] uppercase tracking-widest mt-6">Voltar</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Buttons */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3">
        <AnimatePresence>
          {showBackToTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="w-12 h-12 bg-white text-slate shadow-2xl border border-slate-pale rounded-full flex items-center justify-center hover:bg-slate hover:text-white transition-all"
            >
              <ChevronRight className="-rotate-90" size={24} />
            </motion.button>
          )}
        </AnimatePresence>
        <a
          href={`https://wa.me/${storeConfig.wpp.replace(/\D/g, '')}`}
          target="_blank"
          className="w-14 h-14 bg-[#25D366] text-white shadow-2xl rounded-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all animate-bounce"
          style={{ animationDuration: '3s' }}
        >
          <Phone size={28} />
        </a>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function ProductCard({ product, onDetail, onAdd, onNotify, isFavorite, onToggleFavorite }: { 
  product: Product; 
  onDetail: () => void; 
  onAdd: (qty: number) => void;
  onNotify: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const [qty, setQty] = useState(1);
  const isPromo = (product.discountPrice || 0) < product.price && (product.discountPrice || 0) > 0;
  const discountPercent = isPromo ? Math.round(((product.price - (product.discountPrice || 0)) / product.price) * 100) : 0;
  const finalPrice = product.discountPrice || product.price;

  // Badge Novidade (7 dias)
  const isNew = product.createdAt ? (Date.now() - product.createdAt.toMillis() < 7 * 24 * 60 * 60 * 1000) : false;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="bg-white rounded-[1.5rem] border border-blue/5 overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all group flex flex-col relative"
    >
      <div className="aspect-[4/5] relative overflow-hidden bg-slate-pale cursor-pointer" onClick={onDetail}>
        {isPromo && (
          <div className="absolute top-3 left-3 z-10 bg-gradient-to-br from-rose to-rose-dark text-white px-3 py-1 rounded-full text-[0.6rem] font-black tracking-widest animate-pulse-discount shadow-lg">
            🔥 {discountPercent}% OFF
          </div>
        )}
        {isNew && !isPromo && (
          <div className="absolute top-3 left-3 z-10 bg-blue text-white px-3 py-1 rounded-full text-[0.6rem] font-black tracking-widest shadow-lg">
            ✨ NOVO
          </div>
        )}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
          <div className="bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[0.65rem] font-black shadow-sm flex items-center gap-1">
            <Star size={10} fill="#facc15" color="#facc15" /> {product.rating || 5}
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-lg",
              isFavorite ? "bg-rose text-white" : "bg-white/90 text-slate-soft hover:text-rose"
            )}
          >
            <Heart size={14} fill={isFavorite ? "currentColor" : "none"} />
          </button>
        </div>
        <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
        
        {product.stock <= 0 && (
          <div className="absolute inset-0 bg-slate/60 backdrop-blur-[2px] flex items-center justify-center p-6 text-center">
            <div>
              <div className="text-white font-black italic text-lg leading-tight mb-1">Esgotado!</div>
              <div className="text-rose-light text-[0.6rem] font-bold uppercase tracking-widest">Em breve mais unidades</div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 md:p-5 flex-1 flex flex-col text-center">
        <h3 className="font-black italic text-slate leading-tight mb-2 min-h-[2.5rem] text-sm md:text-base line-clamp-2">{product.name}</h3>
        
        <div className="mb-3">
          {product.stock <= 0 ? (
            <span className="inline-block px-3 py-1 bg-rose-light/50 border border-rose-light text-rose-dark text-[0.55rem] font-black uppercase tracking-widest rounded-full">✗ Esgotado</span>
          ) : product.stock <= 3 ? (
            <span className="inline-block px-3 py-1 bg-amber-50 border border-amber-100 text-amber-700 text-[0.55rem] font-black uppercase tracking-widest rounded-full">⚡ Últimas {product.stock} un.</span>
          ) : (
            <span className="inline-block px-3 py-1 bg-green-50 border border-green-100 text-green-700 text-[0.55rem] font-black uppercase tracking-widest rounded-full">✔ Disponível</span>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mb-4">
          {isPromo && <span className="text-slate-soft text-xs font-bold line-through">{fmt(product.price)}</span>}
          <span className="text-lg md:text-xl font-black italic text-blue">{fmt(finalPrice)}</span>
        </div>

        <div className="mt-auto space-y-2">
          {product.stock > 0 ? (
            <>
              <div className="flex items-center justify-center gap-2 mb-1">
                <button 
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg border border-slate-pale flex items-center justify-center text-slate hover:bg-slate hover:text-white transition-all"
                >
                  <Minus size={12} />
                </button>
                <span className="font-black text-sm w-4">{qty}</span>
                <button 
                  onClick={() => setQty(q => Math.min(product.stock, q + 1))}
                  className="w-8 h-8 rounded-lg border border-slate-pale flex items-center justify-center text-slate hover:bg-slate hover:text-white transition-all"
                >
                  <Plus size={12} />
                </button>
              </div>
              <button 
                onClick={() => { onAdd(qty); setQty(1); }}
                className="w-full py-3 bg-slate text-white rounded-xl font-black uppercase text-[0.6rem] tracking-[0.2em] hover:bg-blue transition-all"
              >
                + Adicionar
              </button>
            </>
          ) : (
            <button 
              onClick={onNotify}
              className="w-full py-3 bg-rose-light text-rose-dark border border-rose-200 rounded-xl font-black uppercase text-[0.6rem] tracking-[0.2em] hover:bg-rose-200 transition-all"
            >
              🔔 Me Avise
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
