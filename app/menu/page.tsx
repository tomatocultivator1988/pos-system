'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/app-layout'
import { getCategories, getMenuItems, getInactiveMenuItems, createMenuItem, updateMenuItem, getVariants, createVariant, getAddonGroups, createAddonGroup, createAddon, getRecipeLines, getRecipeCounts, upsertRecipeLines, uploadMenuImage, deleteMenuImage } from '@/lib/actions/menu'
import { getIngredients } from '@/lib/actions/inventory'
import { Plus, Pencil, Trash2, ChefHat } from 'lucide-react'
import { useModal } from '@/lib/contexts/modal-context'

interface Category { id: string; name: string; sort_order: number; is_active: boolean }
interface Variant { id: string; menu_item_id: string; name: string; price_mode: string; price_override?: number; price_adjustment?: number; is_default: boolean; is_active: boolean }
interface MenuItem { id: string; category_id: string; name: string; description: string; base_price: number; loyalty_points_earned: number; image_url?: string; is_active: boolean; send_to_kds: boolean; sort_order: number; menu_item_variants: Variant[]; recipe_count?: number }

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string | undefined>()
  const [detailOpen, setDetailOpen] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formPrice, setFormPrice] = useState('0')
  const [formDesc, setFormDesc] = useState('')
  const [formPoints, setFormPoints] = useState('0')
  const [formSend, setFormSend] = useState(true)
  const [formActive, setFormActive] = useState(true)
  const [formImageUrl, setFormImageUrl] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const { showConfirmation, hideConfirmation } = useModal()

  const [recipeOpen, setRecipeOpen] = useState(false)
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null)
  const [variants, setVariants] = useState<any[]>([])
  const [vName, setVName] = useState('')
  const [vPrice, setVPrice] = useState('')
  const [vMode, setVMode] = useState<'override' | 'adjustment'>('override')
  const [groups, setGroups] = useState<any[]>([])
  const [gName, setGName] = useState('')
  const [scope, setScope] = useState<'item' | 'variant' | 'addon'>('item')
  const [scopeRef, setScopeRef] = useState<string>('')
  const [recipeRows, setRecipeRows] = useState<{ ingredientId: string; quantity: string }[]>([])
  const [ingSel, setIngSel] = useState('')
  const [ingQty, setIngQty] = useState('')
  const [allIngredients, setAllIngredients] = useState<any[]>([])
  const [scopeLoading, setScopeLoading] = useState(false)

  const [menuLoading, setMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const load = async () => {
    try {
      setMenuLoading(true)
      setMenuError(null)
      const [cats, menuItems, inactive, counts] = await Promise.all([getCategories(), getMenuItems(), getInactiveMenuItems(), getRecipeCounts()])
      setCategories(cats as Category[])
      const items = [...(menuItems as MenuItem[]), ...(inactive as MenuItem[])]
      setItems(items.map((it) => ({ ...it, recipe_count: counts[it.id] || 0 })))
    } catch (err: any) {
      setMenuError(err.message || 'Failed to load menu')
    } finally {
      setMenuLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const openNew = async () => {
    if (categories.length === 0) await load()
    setEditing(null)
    setFormName(''); setFormCategory(categories[0]?.id ?? ''); setFormPrice('0'); setFormDesc(''); setFormPoints('0'); setFormImageUrl('')
    setFormSend(false); setFormActive(true)
    setDetailOpen(true)
  }
  const openEdit = (it: MenuItem) => {
    setEditing(it)
    setFormName(it.name); setFormCategory(it.category_id); setFormPrice(String(it.base_price))
    setFormDesc(it.description); setFormPoints(String(it.loyalty_points_earned ?? 0)); setFormImageUrl(it.image_url ?? ''); setFormSend(it.send_to_kds); setFormActive(it.is_active)
    setDetailOpen(true)
  }

  const save = async () => {
    if (!formName.trim()) {
      showConfirmation({ title: 'Validation', description: 'Item name is required.', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
      return
    }
    const categoryId = formCategory || categories[0]?.id
    if (!categoryId) return
    setSaving(true)
    try {
      if (editing) {
        const removingImage = !!editing.image_url && !formImageUrl
        await updateMenuItem(editing.id, {
          name: formName, category_id: categoryId, base_price: parseFloat(formPrice) || 0,
          description: formDesc, loyalty_points_earned: parseInt(formPoints) || 0, send_to_kds: formSend, is_active: formActive,
          image_url: formImageUrl || null,
        })
        if (removingImage) await deleteMenuImage(editing.image_url!)
      } else {
        await createMenuItem({
          name: formName, category_id: categoryId, base_price: parseFloat(formPrice) || 0,
          description: formDesc, loyalty_points_earned: parseInt(formPoints) || 0, send_to_kds: formSend, sort_order: items.length,
          image_url: formImageUrl || null,
        })
      }
      setDetailOpen(false)
      await load()
    } catch (err: any) {
      const msg = err.message || 'Save failed'
      showConfirmation({ title: 'Error', description: msg.includes('duplicate') || msg.includes('unique') ? `"${formName}" already exists.` : msg, confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
    } finally { setSaving(false) }
  }

  const remove = (it: MenuItem) => {
    let deactivating = false
    showConfirmation({
      title: 'Deactivate Item', description: `Deactivate "${it.name}"?`, confirmText: 'Deactivate',
      cancelText: 'Cancel', isDestructive: true,
      onConfirm: async () => {
        if (deactivating) return
        deactivating = true
        await updateMenuItem(it.id, { is_active: false }); hideConfirmation(); await load()
      },
    })
  }

  const reactivate = (it: MenuItem) => {
    let reactivating = false
    showConfirmation({
      title: 'Reactivate Item', description: `Reactivate "${it.name}"?`, confirmText: 'Reactivate',
      cancelText: 'Cancel', isDestructive: false,
      onConfirm: async () => {
        if (reactivating) return
        reactivating = true
        await updateMenuItem(it.id, { is_active: true }); hideConfirmation(); await load()
      },
    })
  }

  const openRecipe = async (it: MenuItem) => {
    setRecipeItem(it); setRecipeOpen(true)
    const [vs, gs, ings] = await Promise.all([getVariants(it.id), getAddonGroups(it.id), getIngredients()])
    setVariants(vs as any[])
    setGroups(gs as any[])
    setAllIngredients(ings as any[])
    setScope('item'); setScopeRef('')
    const rl = await getRecipeLines({ menuItemId: it.id, scope: 'item' })
    setRecipeRows(rl.map((r: any) => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity_required) })))
  }

  const addVariant = async () => {
    if (!recipeItem || !vName.trim() || !vPrice) return
    try {
      const v = await createVariant({
        menu_item_id: recipeItem.id, name: vName,
        price_mode: vMode, price_override: vMode === 'override' ? parseFloat(vPrice) || 0 : undefined,
        price_adjustment: vMode === 'adjustment' ? parseFloat(vPrice) || 0 : undefined,
      })
      setVariants(prev => [...prev, v as any]); setVName(''); setVPrice('')
    } catch (err: any) {
      showConfirmation({ title: 'Error', description: `"${vName}" already exists for this item.`, confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
    }
  }

  const addRecipeRow = () => {
    if (!ingSel || !ingQty) return
    setRecipeRows(prev => [...prev, { ingredientId: ingSel, quantity: ingQty }]); setIngSel(''); setIngQty('')
  }
  const saveRecipe = async () => {
    if (!recipeItem || scopeLoading) return
    const invalid = recipeRows.some(r => !(parseFloat(r.quantity) > 0))
    if (invalid) {
      showConfirmation({ title: 'Validation', description: 'Recipe quantities must be greater than 0.', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
      return
    }
    try {
      await upsertRecipeLines({
        menuItemId: recipeItem.id, scope, refId: scopeRef || undefined,
        lines: recipeRows.map(r => ({ ingredientId: r.ingredientId, quantity: parseFloat(r.quantity) || 0 })),
      })
      setRecipeOpen(false)
      await load()
    } catch (err: any) {
      showConfirmation({ title: 'Error', description: err.message || 'Failed to save recipe', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
    }
  }

  const filtered = (activeCategory ? items.filter(i => i.category_id === activeCategory) : items).filter(i => showInactive || i.is_active)

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Menu Management</h1>
            <p className="text-muted-foreground">Manage menu items, variants, add-ons and recipes</p>
          </div>
          <button onClick={() => setShowInactive(v => !v)} className={`px-4 py-2 rounded-lg text-sm font-medium ${showInactive ? 'bg-accent text-white' : 'bg-muted text-foreground hover:bg-muted/80'}`}>Show Inactive</button>
          <button onClick={openNew} className="bg-accent text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90">
            <Plus className="w-4 h-4" /> New Item
          </button>
        </div>

        {menuLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="animate-pulse bg-muted rounded-xl h-32" />)}
          </div>
        ) : menuError ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{menuError}</p>
            <button onClick={load} className="bg-accent text-white px-4 py-2 rounded-lg">Retry</button>
          </div>
        ) : (
          <>
            {categories.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            <button onClick={() => setActiveCategory(undefined)} className={`px-4 py-2 rounded-lg text-sm font-medium ${!activeCategory ? 'bg-accent text-white' : 'bg-muted text-foreground hover:bg-muted/80'}`}>All</button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-4 py-2 rounded-lg text-sm font-medium ${activeCategory === c.id ? 'bg-accent text-white' : 'bg-muted text-foreground hover:bg-muted/80'}`}>{c.name}</button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => {
            const def = item.menu_item_variants?.find(v => v.is_default)
            const price = def
              ? (def.price_mode === 'override' ? (def.price_override ?? item.base_price) : item.base_price + (def.price_adjustment ?? 0))
              : item.base_price
            return (
              <div key={item.id} className="bg-card border border-border rounded-xl p-4">
                <div className="rounded-lg h-24 mb-3 overflow-hidden flex items-center justify-center bg-muted">{item.image_url ? <><img src={item.image_url} className="w-full h-24 object-cover" alt={item.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('svg')!.style.display = 'block' }} /><ChefHat className="w-8 h-8 text-muted-foreground" style={{ display: 'none' }} /></> : <ChefHat className="w-8 h-8 text-muted-foreground" />}</div>
                <h3 className="font-semibold mb-2">{item.name}</h3>
                <div className="space-y-1 mb-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Price:</span><span className="font-medium">₱{Number(price || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Variants:</span><span>{item.menu_item_variants?.length || 1}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Recipe:</span><span>{item.recipe_count ?? 0} ing</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openRecipe(item)} className="flex-1 bg-muted text-foreground py-2 rounded-lg hover:bg-muted/80 flex items-center justify-center gap-2 text-sm font-medium"><ChefHat className="w-4 h-4" /> Recipe</button>
                  <button onClick={() => openEdit(item)} className="flex-1 bg-muted text-foreground py-2 rounded-lg hover:bg-muted/80 flex items-center justify-center gap-2 text-sm font-medium"><Pencil className="w-4 h-4" /> Edit</button>
                  {item.is_active
                    ? <button onClick={() => remove(item)} className="bg-muted text-destructive py-2 px-3 rounded-lg hover:bg-muted/80"><Trash2 className="w-4 h-4" /></button>
                    : <button onClick={() => reactivate(item)} className="bg-accent text-white py-2 px-3 rounded-lg hover:opacity-90">Reactivate</button>}
                </div>
              </div>
            )
          })}
        </div>

        {detailOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold mb-4">{editing ? `Edit: ${editing.name}` : 'New Item'}</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <input id="item-name" value={formName} onChange={e => setFormName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Category</label>
                  <select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Base Price (₱)</label>
                  <input id="item-price" type="number" step="0.01" min="0" value={formPrice} onChange={e => setFormPrice(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" rows={2} />
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formSend} onChange={e => setFormSend(e.target.checked)} /> Send to KDS</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} /> Active</label>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Image</label>
                  {formImageUrl && <img src={formImageUrl} alt="Preview" className="mt-1 w-full h-32 object-cover rounded-lg border border-border" />}
                  <div className="flex gap-2 mt-1">
                    <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setImageUploading(true); try { const fd = new FormData(); fd.set('file', f); const url = await uploadMenuImage(fd); setFormImageUrl(url) } catch (err: any) { showConfirmation({ title: 'Upload Failed', description: err.message, confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false }) } finally { setImageUploading(false) } }} className="flex-1 text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent file:text-white hover:file:opacity-90" />
                    {formImageUrl && <button onClick={() => setFormImageUrl('')} className="px-3 py-1 text-sm border border-border rounded-lg bg-muted text-destructive hover:bg-muted/80">Remove</button>}
                  </div>
                  {imageUploading && <p className="text-xs text-muted-foreground mt-1">Uploading...</p>}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setDetailOpen(false)} className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80">Cancel</button>
                <button onClick={save} disabled={saving || imageUploading} className="px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save' : 'Create'}</button>
              </div>
            </div>
          </div>
        )}

        {recipeOpen && recipeItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
              <h2 className="text-lg font-semibold mb-4">Recipe & Options: {recipeItem.name}</h2>

              <section className="mb-6">
                <h3 className="font-medium mb-2">Variants</h3>
                <div className="space-y-1 mb-2">
                  {variants.map(v => <div key={v.id} className="flex justify-between text-sm bg-muted rounded px-3 py-1.5"><span>{v.name} {v.price_mode === 'override' ? `₱${v.price_override}` : `±₱${v.price_adjustment}`}</span></div>)}
                </div>
                <div className="flex gap-2">
                  <input id="variant-name" placeholder="Name" value={vName} onChange={e => setVName(e.target.value)} className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  <select value={vMode} onChange={e => setVMode(e.target.value as any)} className="px-2 py-2 border border-border rounded-lg bg-background text-sm"><option value="override">Override</option><option value="adjustment">Adjust</option></select>
                   <input id="variant-price" placeholder="Price" type="number" step="0.01" min="0" value={vPrice} onChange={e => setVPrice(e.target.value)} className="w-24 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  <button onClick={addVariant} className="bg-accent text-white px-3 py-2 rounded-lg text-sm">Add Variant</button>
                </div>
              </section>

              <section className="mb-6">
                <h3 className="font-medium mb-2">Add-on Groups</h3>
                <div className="flex gap-2 mb-2">
                  <input placeholder="Group name" value={gName} onChange={e => setGName(e.target.value)} className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  <button onClick={async () => { if (!gName.trim() || !recipeItem) return; try { const g = await createAddonGroup({ menu_item_id: recipeItem.id, name: gName }); setGroups(prev => [...prev, { ...(g as any), addons: [] }]); setGName('') } catch (err: any) { showConfirmation({ title: 'Error', description: `Group "${gName}" already exists.`, confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false }) } }} className="bg-accent text-white px-3 py-2 rounded-lg text-sm">Add Group</button>
                </div>
                {groups.map((g, gi) => (
                  <div key={g.id} className="mb-2 pl-3 border-l-2 border-border">
                    <p className="text-sm font-medium">{g.name}</p>
                    <div className="flex gap-2 mt-1">
                      <input placeholder="Add-on name" data-g={gi} className="flex-1 px-2 py-1.5 border border-border rounded-lg bg-background text-sm" onKeyDown={async (e) => { if (e.key !== 'Enter') return; const t = e.target as HTMLInputElement; const nm = t.value.trim(); if (!nm) return; try { const a = await createAddon({ addon_group_id: g.id, name: nm }); setGroups(prev => prev.map((p, i) => i === gi ? { ...p, addons: [...(p.addons || []), a] } : p)); t.value = '' } catch (err: any) { showConfirmation({ title: 'Error', description: `"${nm}" already exists in this group.`, confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false }) } }} />
                    </div>
                  </div>
                ))}
              </section>

              <section className="mb-6">
                <h3 className="font-medium mb-2">Recipe (ingredients consumed)</h3>
                <div className="flex gap-2 mb-2 flex-wrap">
                  <button onClick={() => { setScopeLoading(true); setScope('item'); setScopeRef(''); getRecipeLines({ menuItemId: recipeItem.id, scope: 'item' }).then((rl: any) => { setRecipeRows(rl.map((r: any) => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity_required) }))); setScopeLoading(false) }) }} disabled={scopeLoading} className={`px-3 py-1 rounded-full text-xs ${scope === 'item' ? 'bg-accent text-white' : 'bg-muted'} disabled:opacity-50`}>Base Item</button>
                  {variants.map(v => <button key={v.id} onClick={() => { setScopeLoading(true); setScope('variant'); setScopeRef(v.id); getRecipeLines({ menuItemId: recipeItem.id, scope: 'variant', refId: v.id }).then((rl: any) => { setRecipeRows(rl.map((r: any) => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity_required) }))); setScopeLoading(false) }) }} disabled={scopeLoading} className={`px-3 py-1 rounded-full text-xs ${scope === 'variant' && scopeRef === v.id ? 'bg-accent text-white' : 'bg-muted'} disabled:opacity-50`}>{v.name}</button>)}
                  {groups.flatMap(g => g.addons || []).map((a: any) => <button key={a.id} onClick={() => { setScopeLoading(true); setScope('addon'); setScopeRef(a.id); getRecipeLines({ menuItemId: recipeItem.id, scope: 'addon', refId: a.id }).then((rl: any) => { setRecipeRows(rl.map((r: any) => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity_required) }))); setScopeLoading(false) }) }} disabled={scopeLoading} className={`px-3 py-1 rounded-full text-xs ${scope === 'addon' && scopeRef === a.id ? 'bg-accent text-white' : 'bg-muted'} disabled:opacity-50`}>{a.name}</button>)}
                </div>
                <div className="space-y-1 mb-2">
                  {recipeRows.map((r, i) => (
                    <div key={i} className="flex justify-between text-sm bg-muted rounded px-3 py-1.5">
                      <span>{allIngredients.find(x => x.id === r.ingredientId)?.name ?? r.ingredientId}</span>
                      <span className="flex items-center gap-2"><span className="font-medium">{r.quantity}</span><button onClick={() => setRecipeRows(prev => prev.filter((_, j) => j !== i))} className="text-destructive">x</button></span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select value={ingSel} onChange={e => setIngSel(e.target.value)} className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm"><option value="">Select ingredient...</option>{allIngredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                  <input placeholder="Qty" type="number" step="0.001" value={ingQty} onChange={e => setIngQty(e.target.value)} className="w-24 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  <button onClick={addRecipeRow} className="bg-accent text-white px-3 py-2 rounded-lg text-sm">Add</button>
                </div>
              </section>

              <div className="flex justify-end gap-2">
                <button onClick={() => setRecipeOpen(false)} className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80">Close</button>
                <button onClick={saveRecipe} disabled={scopeLoading} className="px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-50">Save Recipe</button>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
