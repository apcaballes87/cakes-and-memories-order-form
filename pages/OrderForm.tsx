import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, uploadFile } from '../services/supabaseClient';
import type { OrderFormData } from '../types';
import Header from '../components/Header';
import FormSection from '../components/FormSection';
import { Input, Textarea, Checkbox, ChoiceChipGroup } from '../components/FormElements';
import MapPlaceholder from '../components/MapPlaceholder';
import AddressModal from '../components/AddressModal';
import { Plus, Trash2, LoaderCircle } from 'lucide-react';

const productOptions = {
  types: ["1 Tier", "2 Tier", "3 Tier", "4 Tier", "Square or Rectangular", "Cupcakes & Pastries", "Other"],
  subTypes: {
    "1 Tier": ["Bento Cake (4\")", "6\" Round (4\" Thickness)", "8\" Round (4\" Thickness)", "9\" Round (4\" Thickness)", "10\" Round (4\" Thickness)", "6\" Round (5\" Thickness)", "8\" Round (5\" Thickness)", "9\" Round (5\" Thickness)", "10\" Round (5\" Thickness)", "6\" Round (6\" Thickness)", "8\" Round (6\" Thickness)", "Others"],
    "2 Tier": ["6\"x9\"", "7\"x10\"", "8\"x10\""],
    "3 Tier": ["5\"x8\"x12\"", "6\"x9\"x12\"", "7\"x10\"x14\""],
    "Square or Rectangular": ["8x12 Rectangular Cake", "10x14 Rectangular Cake", "12x16 Rectangular Cake", "8x8 Square Cake", "9x9 Square Cake", "10x10 Square Cake"],
    "Cupcakes & Pastries": ["Chocolate Cupcakes", "Vanilla Cupcakes", "Cakepops", "Brownies", "Custom Sugar Cookies", "Crinkles", "Macaroons"],
  }
};


const OrderForm = (): React.JSX.Element => {
  const { subscriberId, numProducts } = useParams();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<{ [key: number]: string }>({});
  const [paymentPreview, setPaymentPreview] = useState<string | null>(null);
  const [isAddressModalOpen, setAddressModalOpen] = useState(false);
  const [deliveryCoordinates, setDeliveryCoordinates] = useState<{ lat: number; lng: number } | null>(null);


  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<OrderFormData>({
    defaultValues: {
      facebookname: '',
      name: '',
      contact: '',
      address: '',
      deliveryMethod: 'Delivery',
      isDifferentReceiver: false,
      receiverName: '',
      receiverContact: '',
      dateEvent: '',
      timeEvent: '',
      products: [],
      paymentOption: '',
      instructions: '',
      paymentScreenshot: null,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'products',
  });

  useEffect(() => {
    const initialProductCount = parseInt(numProducts || '1', 10);
    const currentProductCount = fields.length;
    if (currentProductCount < initialProductCount) {
      for (let i = 0; i < initialProductCount - currentProductCount; i++) {
        append({
          productType: '', productSubType: '', otherProduct: '',
          message: '', details: '', quantity: 1, candle: '', image: null,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numProducts, append, fields.length]);

  // Effect to clean up object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(imagePreviews).forEach(URL.revokeObjectURL);
      if (paymentPreview) {
          URL.revokeObjectURL(paymentPreview);
      }
    };
  }, [imagePreviews, paymentPreview]);

  const deliveryMethod = watch('deliveryMethod');
  const isDifferentReceiver = watch('isDifferentReceiver');
  const watchedProducts = watch('products');
  const addressValue = watch('address');

  const { onChange: paymentScreenshotOnChange, ...paymentScreenshotRegister } = register("paymentScreenshot");


  const onSubmit = async (data: OrderFormData) => {
    setIsSubmitting(true);
    try {
        // Step 1: Upload all images concurrently and get their URLs
        const paymentScreenshotFile = data.paymentScreenshot?.[0];
        const productFiles = data.products.map(p => p.image?.[0]);

        const [paymentScreenshotUrl, ...productImageUrls] = await Promise.all([
            paymentScreenshotFile ? uploadFile(paymentScreenshotFile) : Promise.resolve(null),
            ...productFiles.map(file => file ? uploadFile(file) : Promise.resolve(null)),
        ]);
        
        // Step 2: Construct the base order data object according to the mapping guide
        let finalAddress = '';
        switch(data.deliveryMethod) {
            case 'Pickup at Treehouse':
                finalAddress = 'PICKUP - Cakes and Memories Treehouse';
                break;
            case 'Pickup at Mandaue':
                finalAddress = 'PICKUP - Cakes and Memories Mandaue';
                break;
            case 'Delivery':
            default:
                finalAddress = data.address;
                break;
        }

        const orderData: any = {
            // Customer Info
            facebookname: data.facebookname || '',
            Name: data.name || '',
            contact: data.contact || '',

            // Delivery Info
            Addres: finalAddress,
            latitude: data.deliveryMethod === 'Delivery' ? deliveryCoordinates?.lat ?? 0 : 0,
            longitude: data.deliveryMethod === 'Delivery' ? deliveryCoordinates?.lng ?? 0 : 0,
            receiverName: data.isDifferentReceiver ? data.receiverName : '',
            receiverContact: data.isDifferentReceiver ? data.receiverContact : '',

            // Date & Time
            DateOrdered: new Date().toISOString(),
            DateEvent: data.dateEvent || '',
            TimeEvent: data.timeEvent ? `${data.timeEvent}:00` : '',

            // Payment & Additional
            paymentOption: data.paymentOption || '',
            Comment: data.instructions, // Temporarily set comment; will be updated with order number

            // Auto-generated/System Fields
            orderNumber: paymentScreenshotUrl || '',
            numberproducts: data.products.length,
            branch: "Cebu",
            copiedToList: false,
            hold: false,
            manychatlink: '',
        };

        // Step 3: Map product data, ensuring all product columns are present
        data.products.forEach((product, index) => {
            if (index > 2) return; 

            let productDescription = product.productType;
            if (product.productType === 'Other') {
                productDescription = product.otherProduct;
            } else if (product.productSubType) {
                if (product.productSubType === 'Others') {
                    productDescription += ` - ${product.otherProduct || ''}`;
                } else {
                    productDescription += ` - ${product.productSubType}`;
                }
            }
            
            const imageUrl = productImageUrls[index] || '';

            switch (index) {
                case 0:
                    orderData['Product1'] = productDescription;
                    orderData['code1'] = '';
                    orderData['Message1'] = product.message || '';
                    orderData['details1'] = product.details || '';
                    orderData['quantity1'] = product.quantity || 0;
                    orderData['Price1'] = 0;
                    orderData['Candle'] = product.candle || '';
                    orderData['orderLink'] = imageUrl;
                    break;
                case 1:
                    orderData['Product2'] = productDescription;
                    orderData['code2'] = '';
                    orderData['message2'] = product.message || '';
                    orderData['details2'] = product.details || '';
                    orderData['quantity2'] = product.quantity || 0;
                    orderData['price2'] = 0;
                    orderData['candle2'] = product.candle || '';
                    orderData['pic2'] = imageUrl;
                    break;
                case 2:
                    orderData['product3'] = productDescription;
                    orderData['code3'] = '';
                    orderData['message3'] = product.message || '';
                    orderData['details3'] = product.details || '';
                    orderData['qty3'] = String(product.quantity || 0);
                    orderData['candle3'] = product.candle || '';
                    orderData['pic3'] = imageUrl;
                    break;
            }
        });
        
        // Step 4: Pad out unused product fields with default empty/zero values
        for (let i = data.products.length; i < 3; i++) {
             switch (i) {
                case 1:
                    orderData['Product2'] = ''; orderData['code2'] = ''; orderData['message2'] = ''; orderData['details2'] = ''; orderData['quantity2'] = 0; orderData['price2'] = 0; orderData['candle2'] = ''; orderData['pic2'] = '';
                    break;
                case 2:
                    orderData['product3'] = ''; orderData['code3'] = ''; orderData['message3'] = ''; orderData['details3'] = ''; orderData['qty3'] = '0'; orderData['candle3'] = ''; orderData['pic3'] = '';
                    break;
            }
        }

        // Step 5: Insert data and get the new row's ID
        const { data: insertedData, error: insertError } = await supabase
            .from('New Facebook Orders')
            .insert([orderData])
            .select('id')
            .single();

        if (insertError) throw insertError;
        if (!insertedData) throw new Error('Failed to create order and retrieve its ID.');
        
        // Step 6: Generate the formatted order number
        const year = new Date().getFullYear();
        const paddedId = String(insertedData.id).padStart(4, '0');
        const newOrderNumber = `CMC-${year}-${paddedId}`;
        
        // Step 7: Update the order with the final comment containing the new order number
        const commentText = [newOrderNumber, data.instructions].filter(Boolean).join('\n\n');
        const { error: updateError } = await supabase
            .from('New Facebook Orders')
            .update({ Comment: commentText })
            .eq('id', insertedData.id);

        if (updateError) {
            // Log the error but proceed to notify the user with the generated number.
            // The company will need to manually update the comment if this fails.
            console.error('CRITICAL: Failed to update order comment with generated number:', updateError);
            throw updateError;
        }

        navigate('/thank-you', { state: { orderNumber: newOrderNumber } });
    } catch (error) {
        console.error('Submission failed. Full error:', error);
        let message = 'An unknown error occurred. Please try again.';
        if (error instanceof Error) {
            message = error.message;
        } else if (typeof error === 'object' && error !== null && 'message' in error) {
            message = String((error as any).message);
        } else if (typeof error === 'string') {
            message = error;
        }
        alert(`Error submitting order: ${message}`);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="font-sans">
      <Header />
      <main className="max-w-md mx-auto p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <FormSection title="Customer Details">
            <Input<OrderFormData> label="Facebook Name" name="facebookname" register={register} placeholder="e.g. Juan dela Cruz" isCapitalized />
            <Input<OrderFormData> label="First & Last Name" name="name" register={register} placeholder="e.g. Juan dela Cruz" isCapitalized required />
            <Input<OrderFormData> label="Contact Number" name="contact" register={register} placeholder="09XX XXX XXXX" type="tel" isPhoneNumber required />
          </FormSection>

          <FormSection title="Delivery Information">
            <Controller
                control={control}
                name="deliveryMethod"
                rules={{ required: 'Please select a delivery or pickup option' }}
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <ChoiceChipGroup
                        label="Delivery or Pickup?"
                        options={["Delivery", "Pickup at Treehouse", "Pickup at Mandaue"]}
                        value={value}
                        onChange={onChange}
                        error={error?.message}
                    />
                )}
            />
            {deliveryMethod === 'Delivery' && (
              <>
                <div className="mb-4">
                  <label htmlFor="address-display" className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
                  <div
                    id="address-display"
                    onClick={() => setAddressModalOpen(true)}
                    className="w-full px-4 py-3 border border-primaryLight rounded-2xl bg-white cursor-pointer min-h-[50px] flex items-center"
                    aria-label="Set delivery address"
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAddressModalOpen(true); }}
                  >
                    {addressValue ? (
                      <span className="text-gray-900">{addressValue}</span>
                    ) : (
                      <span className="text-gray-500">Click to set location on map</span>
                    )}
                  </div>
                  <input type="hidden" {...register('address', { required: deliveryMethod === 'Delivery' ? 'Address is required for delivery' : false })} />
                  {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
                </div>
                
                <MapPlaceholder address={addressValue} coordinates={deliveryCoordinates} />
                
                <Checkbox<OrderFormData> label="Different Receiver" name="isDifferentReceiver" register={register} />
                {isDifferentReceiver && (
                  <div className="pl-4 border-l-2 border-primaryLight mt-4">
                    <Input<OrderFormData> label="Receiver's Name" name="receiverName" register={register} placeholder="Receiver's full name" isCapitalized required={isDifferentReceiver} />
                    <Input<OrderFormData> label="Receiver's Contact" name="receiverContact" register={register} placeholder="09XX XXX XXXX" type="tel" isPhoneNumber required={isDifferentReceiver}/>
                  </div>
                )}
              </>
            )}

            {deliveryMethod === 'Pickup at Treehouse' && (
                <div className="mt-4 p-4 bg-lightBg rounded-2xl border border-dashed border-primaryLight text-center">
                    <p className="font-semibold text-primary">Pickup Location:</p>
                    <p className="text-gray-800">Cakes and Memories Treehouse</p>
                    <a href="https://maps.app.goo.gl/FPcQxJVM3taLjuzC7" target="_blank" rel="noopener noreferrer" className="text-teal hover:underline font-medium text-sm mt-1 inline-block">
                        View on Google Maps
                    </a>
                </div>
            )}

            {deliveryMethod === 'Pickup at Mandaue' && (
                <div className="mt-4 p-4 bg-lightBg rounded-2xl border border-dashed border-primaryLight text-center">
                    <p className="font-semibold text-primary">Pickup Location:</p>
                    <p className="text-gray-800">Cakes and Memories Mandaue</p>
                    <a href="https://maps.app.goo.gl/Y7eS8WfQqJWiRKrG8" target="_blank" rel="noopener noreferrer" className="text-teal hover:underline font-medium text-sm mt-1 inline-block">
                        View on Google Maps
                    </a>
                </div>
            )}
          </FormSection>

          <FormSection title="Date & Time of Event">
            <Input<OrderFormData> label="Date of Event" name="dateEvent" register={register} type="date" required min={today} />
            <div className="mb-4">
                <label htmlFor="timeEvent" className="block text-sm font-medium text-gray-700 mb-1">Time of Event</label>
                <input
                    id="timeEvent"
                    type="time"
                    min="09:00"
                    max="20:00"
                    {...register("timeEvent", {
                        required: "Time is required",
                        validate: value => {
                            if (!value) return true;
                            const hour = parseInt(value.split(':')[0]);
                            return (hour >= 9 && hour < 20) || 'Please select a time between 9:00 AM and 8:00 PM';
                        }
                    })}
                    className="w-full px-4 py-3 border border-primaryLight rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal transition-all"
                />
                {errors.timeEvent && <p className="text-red-500 text-xs mt-1">{errors.timeEvent.message}</p>}
            </div>
          </FormSection>

          <FormSection title="Product Details">
            {fields.map((field, index) => {
              const { onChange: formImageOnChange, ...restImageRegister } = register(`products.${index}.image`);
              return (
              <div key={field.id} className="relative p-4 mb-4 border border-primaryLight rounded-2xl">
                 {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full"
                  >
                    <Trash2 size={18} />
                  </button>
                 )}
                 <h3 className="font-semibold text-gray-800 mb-2">Product {index + 1}</h3>

                <Controller
                  control={control}
                  name={`products.${index}.productType`}
                  rules={{ required: 'Please select a product type' }}
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <ChoiceChipGroup
                      label="Product Type"
                      options={productOptions.types}
                      value={value}
                      onChange={onChange}
                      error={error?.message}
                    />
                  )}
                />

                {watchedProducts[index]?.productType && productOptions.subTypes[watchedProducts[index].productType] && (
                    <Controller
                        control={control}
                        name={`products.${index}.productSubType`}
                        rules={{ required: 'Please select an option' }}
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                            <ChoiceChipGroup
                                label="Details"
                                options={productOptions.subTypes[watchedProducts[index].productType]}
                                value={value}
                                onChange={onChange}
                                error={error?.message}
                            />
                        )}
                    />
                )}

                {(watchedProducts[index]?.productType === 'Other' || watchedProducts[index]?.productSubType === 'Others') && (
                    <Input<OrderFormData> 
                        label="Please specify" 
                        name={`products.${index}.otherProduct`} 
                        register={register} 
                        required 
                        placeholder="Specify product details"
                    />
                )}
                 
                <Textarea<OrderFormData> label="Message on Cake" name={`products.${index}.message`} register={register} placeholder="e.g. Happy Birthday, Juan!"/>
                <Textarea<OrderFormData> label="Additional Details" name={`products.${index}.details`} register={register} placeholder="Design specifications, color, etc."/>
                <Input<OrderFormData> label="Quantity" name={`products.${index}.quantity`} register={register} type="number" defaultValue={1} required min={1}/>
                <Input<OrderFormData> label="Candle" name={`products.${index}.candle`} register={register} placeholder="e.g. 1pc stick candle"/>
                <div className="mb-4">
                   <label className="block text-sm font-medium text-gray-700 mb-1">Upload Image</label>
                   <input 
                      type="file" 
                      accept="image/*"
                      {...restImageRegister}
                      onChange={(e) => {
                        formImageOnChange(e);
                        const file = e.target.files?.[0];
                        if (imagePreviews[index]) {
                          URL.revokeObjectURL(imagePreviews[index]);
                        }
                        if (file) {
                          const url = URL.createObjectURL(file);
                          setImagePreviews(prev => ({...prev, [index]: url}));
                        } else {
                          setImagePreviews(prev => {
                            const newPreviews = {...prev};
                            delete newPreviews[index];
                            return newPreviews;
                          });
                        }
                      }}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-primary hover:file:bg-pink-100"
                    />
                </div>
                {imagePreviews[index] && (
                  <div className="mb-4 relative w-28 h-28">
                    <img src={imagePreviews[index]} alt="Preview" className="w-full h-full object-cover rounded-2xl border border-gray-300" />
                    <button
                      type="button"
                      onClick={() => {
                        setValue(`products.${index}.image`, null);
                        if (imagePreviews[index]) {
                          URL.revokeObjectURL(imagePreviews[index]);
                        }
                        setImagePreviews(prev => {
                          const newPreviews = {...prev};
                          delete newPreviews[index];
                          return newPreviews;
                        });
                      }}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                      aria-label="Remove image"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )})}
            {fields.length < 3 && (
             <button
                type="button"
                onClick={() => append({ productType: '', productSubType: '', otherProduct: '', message: '', details: '', quantity: 1, candle: '', image: null })}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-primaryLight text-primary rounded-2xl hover:bg-pink-50 transition-colors"
             >
                <Plus size={18} /> Add Another Product
             </button>
            )}
          </FormSection>

          <FormSection title="Payment & Instructions">
             <Controller
                control={control}
                name="paymentOption"
                rules={{ required: 'Please select a payment option' }}
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <ChoiceChipGroup
                        label="Payment Option"
                        options={["GCash", "Maya", "Bank Transfer", "Credit Card", "Store Payment"]}
                        value={value}
                        onChange={onChange}
                        error={error?.message}
                    />
                )}
            />
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload Payment Screenshot</label>
                <input
                    type="file"
                    accept="image/*"
                    {...paymentScreenshotRegister}
                    onChange={(e) => {
                        paymentScreenshotOnChange(e);
                        const file = e.target.files?.[0];
                        if (paymentPreview) {
                            URL.revokeObjectURL(paymentPreview);
                        }
                        if (file) {
                            const url = URL.createObjectURL(file);
                            setPaymentPreview(url);
                        } else {
                            setPaymentPreview(null);
                        }
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-primary hover:file:bg-pink-100"
                />
            </div>
             {paymentPreview && (
                <div className="mb-4 relative w-28 h-28">
                    <img src={paymentPreview} alt="Payment Preview" className="w-full h-full object-cover rounded-2xl border border-gray-300" />
                    <button
                        type="button"
                        onClick={() => {
                            setValue(`paymentScreenshot`, null);
                            if (paymentPreview) {
                                URL.revokeObjectURL(paymentPreview);
                            }
                            setPaymentPreview(null);
                        }}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                        aria-label="Remove payment screenshot"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}
             <Textarea<OrderFormData> label="Special Instructions" name="instructions" register={register} placeholder="Any other notes for your order."/>
          </FormSection>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-white font-bold py-4 px-4 rounded-2xl hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all flex items-center justify-center"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="animate-spin mr-2" size={20} />
                Submitting...
              </>
            ) : "Submit Order" }
          </button>
        </form>
      </main>
      <AddressModal 
        isOpen={isAddressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        onSelect={(selection) => {
          setValue('address', selection.address, { shouldValidate: true });
          setDeliveryCoordinates(selection.coordinates);
          setAddressModalOpen(false);
        }}
      />
    </div>
  );
};

export default OrderForm;