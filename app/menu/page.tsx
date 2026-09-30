'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/app-layout'
import { getCategories, getMenuItems, getInactiveMenuItems, createMenuItem, updateMenuItem, getVariants, createVariant, updateVariant, deleteVariant, getAddonGroups, createAddonGroup, createAddon, getRecipeLines, getRecipeCounts, upsertRecipeLines, uploadMenuImage, deleteMenuImage, createCategory, updateCategory, deleteCategory } from '@/lib/actions/menu'
import { getIngredients } from '@/lib/actions/inventory'
import { Plus, Pencil, Trash2, ChefHat, Tag, X } from 'lucide-react'
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
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null)
  const [editVName, setEditVName] = useState('')
  const [editVMode, setEditVMode] = useState<'override' | 'adjustment'>('override')
  const [editVPrice, setEditVPrice] = useState('')
  const [variantBusy, setVariantBusy] = useState(false)
  const [groups, setGroups] = useState<any[]>([])
  const [gName, setGName] = useState('')
  const [addonNames, setAddonNames] = useState<Record<string, string>>({})
  const [scope, setScope] = useState<'item' | 'variant' | 'addon'>('item')
  const [scopeRef, setScopeRef] = useState<string>('')
  const [recipeRows, setRecipeRows] = useState<{ ingredientId: string; quantity: string }[]>([])
  const [ingSel, setIngSel] = useState('')
  const [ingQty, setIngQty] = useState('')
  const [allIngredients, setAllIngredients] = useState<any[]>([])
  const [scopeLoading, setScopeLoading] = useState(false)
  const [recipeSavedMsg, setRecipeSavedMsg] = useState('')

  const [menuLoading, setMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')

  const load = async (showSkeleton = false) => {
    try {
      if (showSkeleton) setMenuLoading(true)
      setMenuError(null)
      const [cats, menuItems, inactive, counts] = await Promise.all([getCategories(), getMenuItems(), getInactiveMenuItems(), getRecipeCounts()])
      setCategories(cats as Category[])
      const items = [...(menuItems as MenuItem[]), ...(inactive as MenuItem[])]
      setItems(items.map((it) => ({ ...it, recipe_count: counts[it.id] || 0 })))
    } catch (err: any) {
      setMenuError(err.message || 'Failed to load menu')
    } finally {
      if (showSkeleton) setMenuLoading(false)
    }
  }
  useEffect(() => { load(true) }, [])

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

  const addCategory = async () => {
    if (!newCatName.trim()) return
    try {
      await createCategory({ name: newCatName.trim(), sort_order: categories.length })
      setNewCatName('')
      await load()
    } catch (err: any) {
      showConfirmation({ title: 'Error', description: err.message?.includes('duplicate') ? `"${newCatName}" already exists.` : err.message, confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
    }
  }

  const renameCategory = async (id: string) => {
    if (!editingCatName.trim()) return
    try {
      await updateCategory(id, { name: editingCatName.trim() })
      setEditingCatId(null); setEditingCatName('')
      await load()
    } catch (err: any) {
      showConfirmation({ title: 'Error', description: err.message?.includes('duplicate') ? `"${editingCatName}" already exists.` : err.message, confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
    }
  }

  const removeCategory = (cat: Category) => {
    const itemCount = items.filter(i => i.category_id === cat.id && i.is_active).length
    let deactivating = false
    showConfirmation({
      title: 'Delete Category',
      description: itemCount > 0
        ? `Deactivate "${cat.name}"? ${itemCount} item(s) in this category will also be hidden.`
        : `Deactivate "${cat.name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        if (deactivating) return
        deactivating = true
        await deleteCategory(cat.id)
        if (activeCategory === cat.id) setActiveCategory(undefined)
        hideConfirmation(); await load()
      },
    })
  }

  const openRecipe = async (it: MenuItem) => {
    setRecipeItem(it); setRecipeOpen(true)
    setRecipeSavedMsg('')
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

  const startEditVariant = (v: any) => {
    setEditingVariantId(v.id)
    setEditVName(v.name)
    setEditVMode((v.price_mode as any) || 'override')
    const currentPrice = v.price_mode === 'override' ? (v.price_override ?? 0) : (v.price_adjustment ?? 0)
    setEditVPrice(String(currentPrice))
  }

  const cancelEditVariant = () => {
    setEditingVariantId(null)
    setEditVName('')
    setEditVPrice('')
  }

  const saveEditVariant = async (variantId: string) => {
    if (!editVName.trim() || editVPrice === '') return
    const priceNum = parseFloat(editVPrice)
    if (isNaN(priceNum) || (editVMode === 'override' && priceNum < 0)) {
      showConfirmation({
        title: 'Invalid Price',
        description: 'Please enter a valid price for the variant.',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => hideConfirmation(),
        isDestructive: false,
      })
      return
    }

    setVariantBusy(true)
    try {
      const updated = await updateVariant(variantId, {
        name: editVName.trim(),
        price_mode: editVMode,
        price_override: editVMode === 'override' ? priceNum : null,
        price_adjustment: editVMode === 'adjustment' ? priceNum : null,
      })
      setVariants(prev => prev.map(v => v.id === variantId ? { ...v, ...updated } : v))
      setEditingVariantId(null)
      await load()
    } catch (err: any) {
      showConfirmation({
        title: 'Error Updating Variant',
        description: err.message || 'Could not update variant.',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => hideConfirmation(),
        isDestructive: false,
      })
    } finally {
      setVariantBusy(false)
    }
  }

  const removeVariant = (v: any) => {
    showConfirmation({
      title: 'Delete Variant',
      description: `Are you sure you want to remove variant "${v.name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        hideConfirmation()
        try {
          await deleteVariant(v.id)
          setVariants(prev => prev.filter(item => item.id !== v.id))
          await load()
        } catch (err: any) {
          showConfirmation({
            title: 'Error Deleting Variant',
            description: err.message || 'Could not delete variant.',
            confirmText: 'OK',
            cancelText: '',
            onConfirm: () => hideConfirmation(),
            isDestructive: false,
          })
        }
      },
    })
  }

  const addAddonToGroup = async (group: any) => {
    const name = (addonNames[group.id] || '').trim()
    if (!name) return
    try {
      const addon = await createAddon({ addon_group_id: group.id, name })
      setGroups(prev => prev.map(current =>
        current.id === group.id
          ? { ...current, addons: [...(current.addons || []), addon] }
          : current
      ))
      setAddonNames(prev => ({ ...prev, [group.id]: '' }))
    } catch (err: any) {
      showConfirmation({ title: 'Error', description: `"${name}" already exists in this group.`, confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
    }
  }

  const selectRecipeScope = async (nextScope: 'item' | 'variant' | 'addon', refId = '') => {
    if (!recipeItem || scopeLoading) return
    setScopeLoading(true)
    setScope(nextScope)
    setScopeRef(refId)
    setRecipeSavedMsg('')
    try {
      const lines = await getRecipeLines({
        menuItemId: recipeItem.id,
        scope: nextScope,
        refId: refId || undefined,
      })
      setRecipeRows(lines.map((r: any) => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity_required) })))
    } finally {
      setScopeLoading(false)
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
    setScopeLoading(true)
    try {
      await upsertRecipeLines({
        menuItemId: recipeItem.id, scope, refId: scopeRef || undefined,
        lines: recipeRows.map(r => ({ ingredientId: r.ingredientId, quantity: parseFloat(r.quantity) || 0 })),
      })
      const targetLabel = scope === 'item' ? 'Base Item' : scope === 'variant' ? (variants.find(v => v.id === scopeRef)?.name || 'Variant') : 'Add-on'
      setRecipeSavedMsg(`✓ Recipe for "${targetLabel}" saved successfully! (${recipeRows.length} ingredient${recipeRows.length === 1 ? '' : 's'})`)
      setTimeout(() => setRecipeSavedMsg(''), 4000)
      await load()
    } catch (err: any) {
      showConfirmation({ title: 'Error', description: err.message || 'Failed to save recipe', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
    } finally {
      setScopeLoading(false)
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
          <button onClick={() => setCatModalOpen(true)} className="bg-muted text-foreground px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-muted/80 text-sm font-medium">
            <Tag className="w-4 h-4" /> Categories
          </button>
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
            <button onClick={() => load(true)} className="bg-accent text-white px-4 py-2 rounded-lg">Retry</button>
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
          </>
        )}

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
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">Variants</h3>
                  <span className="text-xs text-muted-foreground">Click pencil to edit price or name</span>
                </div>
                <div className="space-y-2 mb-3">
                  {variants.map(v => {
                    const isEditingThis = editingVariantId === v.id
                    if (isEditingThis) {
                      return (
                        <div key={v.id} className="p-3 bg-card border-2 border-accent/40 rounded-xl space-y-2.5 shadow-xs">
                          <div className="text-xs font-semibold text-accent uppercase tracking-wider">Editing Variant</div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <input
                              type="text"
                              placeholder="Variant Name"
                              value={editVName}
                              onChange={e => setEditVName(e.target.value)}
                              className="flex-1 min-w-[130px] px-3 py-1.5 border border-border rounded-lg bg-background text-sm font-medium focus:outline-accent"
                            />
                            <select
                              value={editVMode}
                              onChange={e => setEditVMode(e.target.value as any)}
                              className="px-2 py-1.5 border border-border rounded-lg bg-background text-xs"
                            >
                              <option value="override">Override Price (₱)</option>
                              <option value="adjustment">Price Adjustment (±₱)</option>
                            </select>
                            <div className="relative w-28">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">₱</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={editVPrice}
                                onChange={e => setEditVPrice(e.target.value)}
                                className="w-full pl-6 pr-2 py-1.5 border border-border rounded-lg bg-background text-sm font-mono font-medium focus:outline-accent"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={cancelEditVariant}
                              disabled={variantBusy}
                              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditVariant(v.id)}
                              disabled={variantBusy || !editVName.trim() || editVPrice === ''}
                              className="px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                            >
                              {variantBusy ? 'Saving...' : 'Save Price'}
                            </button>
                          </div>
                        </div>
                      )
                    }

                    const displayPrice = v.price_mode === 'override'
                      ? `₱${Number(v.price_override || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                      : `${Number(v.price_adjustment || 0) >= 0 ? '+' : ''}₱${Number(v.price_adjustment || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

                    return (
                      <div
                        key={v.id}
                        className="flex items-center justify-between text-sm bg-muted/60 hover:bg-muted border border-border/50 rounded-xl px-3.5 py-2 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-medium text-foreground">{v.name}</span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-background border border-border font-mono font-semibold text-accent">
                            {displayPrice}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditVariant(v)}
                            className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit price & name"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeVariant(v)}
                            className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete variant"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {variants.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2 text-center">No variants added yet. Add sizes or options below.</p>
                  )}
                </div>

                {/* Add Variant Form */}
                <div className="p-3 bg-muted/30 border border-dashed border-border rounded-xl">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Add New Variant</div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      id="variant-name"
                      placeholder="Variant name (e.g. 16oz Iced)"
                      value={vName}
                      onChange={e => setVName(e.target.value)}
                      className="flex-1 min-w-[140px] px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-accent"
                    />
                    <select
                      value={vMode}
                      onChange={e => setVMode(e.target.value as any)}
                      className="px-2 py-2 border border-border rounded-lg bg-background text-xs"
                    >
                      <option value="override">Override (₱)</option>
                      <option value="adjustment">Adjust (±₱)</option>
                    </select>
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">₱</span>
                      <input
                        id="variant-price"
                        placeholder="0.00"
                        type="number"
                        step="0.01"
                        min="0"
                        value={vPrice}
                        onChange={e => setVPrice(e.target.value)}
                        className="w-full pl-6 pr-2 py-2 border border-border rounded-lg bg-background text-sm font-mono focus:outline-accent"
                      />
                    </div>
                    <button
                      onClick={addVariant}
                      disabled={!vName.trim() || !vPrice}
                      className="bg-accent text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      Add Variant
                    </button>
                  </div>
                </div>
              </section>

              <section className="mb-6">
                <h3 className="font-medium mb-2">Add-on Groups</h3>
                <div className="flex gap-2 mb-2">
                  <input placeholder="Group name" value={gName} onChange={e => setGName(e.target.value)} className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  <button onClick={async () => { if (!gName.trim() || !recipeItem) return; try { const g = await createAddonGroup({ menu_item_id: recipeItem.id, name: gName }); setGroups(prev => [...prev, { ...(g as any), addons: [] }]); setGName('') } catch (err: any) { showConfirmation({ title: 'Error', description: `Group "${gName}" already exists.`, confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false }) } }} className="bg-accent text-white px-3 py-2 rounded-lg text-sm">Add Group</button>
                </div>
                {groups.map(g => (
                  <div key={g.id} className="mb-2 pl-3 border-l-2 border-border">
                    <p className="text-sm font-medium">{g.name}</p>
                    <div className="flex gap-2 mt-1">
                      <input
                        placeholder="Add-on name"
                        value={addonNames[g.id] || ''}
                        onChange={e => setAddonNames(prev => ({ ...prev, [g.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addAddonToGroup(g) }}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-border rounded-lg bg-background text-sm"
                      />
                      <button onClick={() => addAddonToGroup(g)} disabled={!(addonNames[g.id] || '').trim()} className="shrink-0 bg-accent text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">Add Add-on</button>
                    </div>
                  </div>
                ))}
              </section>

              <section className="mb-6">
                <h3 className="font-medium">Inventory Recipe</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Choose what you are setting up, then add only the ingredients it uses.</p>

                {recipeSavedMsg && (
                  <div className="mb-3 p-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-xs font-semibold flex items-center justify-between">
                    <span>{recipeSavedMsg}</span>
                  </div>
                )}

                <div className="space-y-3 mb-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">BASE PRODUCT</p>
                    <button
                      onClick={() => selectRecipeScope('item')}
                      disabled={scopeLoading}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        scope === 'item' ? 'bg-accent text-white shadow-xs' : 'bg-muted text-foreground hover:bg-muted/80'
                      } disabled:opacity-50`}
                    >
                      Base Item
                    </button>
                  </div>

                  {variants.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">VARIANT RECIPES</p>
                      <div className="flex gap-2 flex-wrap">
                        {variants.map(v => (
                          <button
                            key={v.id}
                            onClick={() => selectRecipeScope('variant', v.id)}
                            disabled={scopeLoading}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                              scope === 'variant' && scopeRef === v.id
                                ? 'bg-accent text-white shadow-xs ring-2 ring-accent/30'
                                : 'bg-muted text-foreground hover:bg-muted/80'
                            } disabled:opacity-50`}
                          >
                            {v.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {groups.some(g => (g.addons || []).length > 0) && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">ADD-ON RECIPES</p>
                      <div className="space-y-2">
                        {groups.filter(g => (g.addons || []).length > 0).map(g => (
                          <div key={g.id}>
                            <p className="text-xs text-muted-foreground mb-1">{g.name}</p>
                            <div className="flex gap-2 flex-wrap">
                              {(g.addons || []).map((a: any) => (
                                <button
                                  key={a.id}
                                  onClick={() => selectRecipeScope('addon', a.id)}
                                  disabled={scopeLoading}
                                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                    scope === 'addon' && scopeRef === a.id
                                      ? 'bg-accent text-white shadow-xs ring-2 ring-accent/30'
                                      : 'bg-muted text-foreground hover:bg-muted/80'
                                  } disabled:opacity-50`}
                                >
                                  {a.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3.5 bg-muted/40 border border-border rounded-xl mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Editing Recipe For: <span className="text-foreground font-bold">{scope === 'item' ? 'Base Item' : scope === 'variant' ? variants.find(v => v.id === scopeRef)?.name : groups.flatMap(g => g.addons || []).find((a: any) => a.id === scopeRef)?.name}</span>
                    </p>
                    <span className="text-xs text-muted-foreground">{recipeRows.length} ingredient{recipeRows.length === 1 ? '' : 's'}</span>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    {recipeRows.map((r, i) => (
                      <div key={i} className="flex justify-between items-center text-sm bg-background border border-border/60 rounded-lg px-3 py-2">
                        <span className="font-medium text-foreground">{allIngredients.find(x => x.id === r.ingredientId)?.name ?? r.ingredientId}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-accent text-xs bg-accent/10 px-2 py-0.5 rounded">{r.quantity}</span>
                          <button
                            onClick={() => setRecipeRows(prev => prev.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                            title="Remove ingredient"
                          >
                            x
                          </button>
                        </div>
                      </div>
                    ))}
                    {recipeRows.length === 0 && (
                      <p className="text-xs text-muted-foreground py-3 text-center italic">
                        No ingredients added yet for this {scope === 'item' ? 'base item' : scope === 'variant' ? 'variant' : 'add-on'}. Select an ingredient below and click Add.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <select value={ingSel} onChange={e => setIngSel(e.target.value)} className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-accent">
                      <option value="">Select ingredient...</option>
                      {allIngredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.base_unit})</option>)}
                    </select>
                    <input
                      placeholder="Qty"
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={ingQty}
                      onChange={e => setIngQty(e.target.value)}
                      className="w-24 px-3 py-2 border border-border rounded-lg bg-background text-sm font-mono focus:outline-accent"
                    />
                    <button
                      onClick={addRecipeRow}
                      disabled={!ingSel || !(parseFloat(ingQty) > 0)}
                      className="bg-accent text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </section>

              <div className="flex justify-end gap-2">
                <button onClick={() => setRecipeOpen(false)} className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80">Close</button>
                <button onClick={saveRecipe} disabled={scopeLoading} className="px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-50">Save Recipe</button>
              </div>
            </div>
          </div>
        )}

        {/* Category Management Modal */}
        {catModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Manage Categories</h2>
                <button onClick={() => setCatModalOpen(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>

              {/* Add new category */}
              <div className="flex gap-2 mb-4">
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                  placeholder="New category name"
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm"
                />
                <button onClick={addCategory} className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">Add</button>
              </div>

              {/* Category list */}
              <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No categories yet</p>
                ) : categories.map(cat => {
                  const count = items.filter(i => i.category_id === cat.id && i.is_active).length
                  return (
                    <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 group">
                      {editingCatId === cat.id ? (
                        <input
                          autoFocus
                          value={editingCatName}
                          onChange={e => setEditingCatName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') renameCategory(cat.id); if (e.key === 'Escape') { setEditingCatId(null); setEditingCatName('') } }}
                          onBlur={() => renameCategory(cat.id)}
                          className="flex-1 px-2 py-1 border border-accent rounded text-sm"
                        />
                      ) : (
                        <span className="flex-1 text-sm font-medium">{cat.name}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{count} items</span>
                      {editingCatId !== cat.id && (
                        <button onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name) }} className="p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => removeCategory(cat)} className="p-1 hover:bg-muted rounded text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-end mt-4">
                <button onClick={() => setCatModalOpen(false)} className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 text-sm">Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
